import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { unlinkSync, closeSync, openSync } from "node:fs";
const file = resolve("prisma", `test-${randomUUID()}.db`);
process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`;
process.env.NODE_ENV = "test";
process.env.TIDECLOAK_MODE = "mock";
process.env.APP_ORIGIN = "http://localhost:3000";
const { db } = await import("../src/lib/db");
const { handle } = await import("../src/lib/api");
const { seed } = await import("../prisma/seed");
const { mockGuard } = await import("../src/lib/auth");
const { runScenarios } = await import("../src/lib/scenarios");
let cookie = "";
async function send(action: string, body?: unknown, anonymous = false) {
  const r = await handle(
    new Request(`http://localhost:3000/api/${action}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        Cookie: anonymous ? "" : cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: r.status, body: await r.json() };
}
async function login(id: string) {
  assert.equal((await send("login", { userId: id })).status, 200);
}
before(async () => {
  closeSync(openSync(file, "a"));
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
    { env: process.env, stdio: "pipe" },
  );
  await seed(db);
});
after(async () => {
  await db.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      unlinkSync(file + suffix);
    } catch {}
  }
});
test("all eight security scenarios exercise actual request handlers", async () => {
  const results: { passed: boolean; label: string }[] = [];
  await runScenarios(send, (row) => results.push(row));
  assert.ok(results.length > 25);
  assert.ok(results.every((r) => r.passed));
  for (let i = 1; i <= 8; i++)
    assert.ok(results.some((r) => r.label.startsWith(`${i} ·`)));
  const settled = await db.settlementRecord.findMany();
  assert.equal(settled.length, 1);
  assert.equal(settled[0].amount, 12_000_000);
});
test("sign-out invalidates the server session, sign-in rotates opaque cookies", async () => {
  await login("hcmc-user");
  const first = cookie;
  await login("hcmc-user");
  assert.notEqual(cookie, first);
  assert.match(cookie, /trustvault_session=[a-f0-9]{64}$/);
  assert.equal((await send("snapshot")).status, 200);
  await send("logout", {});
  assert.equal((await send("snapshot")).status, 401);
});
test("expired sessions are rejected", async () => {
  await login("hcmc-user");
  await db.session.updateMany({
    where: { userId: "hcmc-user" },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await send("snapshot")).status, 401);
});
test("production mock mode and unknown modes fail closed", () => {
  assert.throws(() => mockGuard("production", "mock"));
  assert.throws(() => mockGuard("development", "typo"));
  assert.equal(mockGuard("production", "real"), "real");
});
test("real mode refuses mock sessions and never silently falls back", async () => {
  await login("hcmc-admin");
  process.env.TIDECLOAK_MODE = "real";
  try {
    assert.equal((await send("snapshot")).status, 503);
  } finally {
    process.env.TIDECLOAK_MODE = "mock";
  }
});
test("CSRF and malformed payloads are rejected before mutation", async () => {
  await login("hcmc-admin");
  const r = await handle(
    new Request("http://localhost:3000/api/commitment", {
      method: "POST",
      headers: {
        Origin: "https://attacker.invalid",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: "{}",
    }),
  );
  assert.equal(r.status, 403);
  assert.equal((await send("propose", { amount: -1 })).status, 400);
});
const proposal = {
  beneficiaryId: "linh",
  amount: 300,
  category: "MEDICAL",
  destination: "SIM-VN-2026-001",
  description: "Test exact payload binding",
  evidence: "TEST-INVOICE",
};
async function createAuthorized() {
  await login("hcmc-user");
  const t = await send("propose", proposal);
  assert.equal(t.status, 201);
  for (const org of ["hcmc", "hanoi", "melbourne"]) {
    await login(`${org}-analyst`);
    assert.equal(
      (
        await send("approve", {
          id: t.body.id,
          organizationId: org,
          decision: "APPROVE",
        })
      ).status,
      200,
    );
  }
  return t.body.id as string;
}
test("cross-user access and cross-organization funding changes return 403", async () => {
  await login("hcmc-user");
  const t = await send("propose", proposal);
  assert.equal(t.status, 201);
  await login("hanoi-user");
  const snapshot = await send("snapshot");
  assert.ok(
    !snapshot.body.transactions.some((x: { id: string }) => x.id === t.body.id),
  );
  assert.equal((await send("settle", { id: t.body.id })).status, 403);
  await login("hcmc-admin");
  assert.equal(
    (
      await send("commitment", {
        organizationId: "hanoi",
        amount: 1,
        categories: ["MEDICAL"],
        beneficiaryId: "linh",
        expiresAt: "2027-12-31T00:00:00.000Z",
        independentVerification: false,
      })
    ).status,
    403,
  );
});
test("duplicate approvals and self-verification are rejected", async () => {
  await login("melbourne-analyst");
  const t = await send("propose", proposal);
  assert.equal(t.status, 201);
  assert.equal(
    (
      await send("approve", {
        id: t.body.id,
        organizationId: "melbourne",
        decision: "APPROVE",
      })
    ).status,
    403,
  );
  await login("hcmc-analyst");
  assert.equal(
    (
      await send("approve", {
        id: t.body.id,
        organizationId: "hcmc",
        decision: "APPROVE",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send("approve", {
        id: t.body.id,
        organizationId: "hcmc",
        decision: "APPROVE",
      })
    ).status,
    409,
  );
});
test("database payload tampering is detected at settlement", async () => {
  const id = await createAuthorized();
  await db.transaction.update({
    where: { id },
    data: { destination: "SIM-ATTACK" },
  });
  await login("hcmc-user");
  const r = await send("settle", { id });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /tampering/);
  assert.equal(
    await db.settlementRecord.count({ where: { transactionId: id } }),
    0,
  );
});
test("concurrent settlement attempts debit exactly once", async () => {
  const id = await createAuthorized();
  await login("hcmc-user");
  const before = await db.fundingCommitment.aggregate({
    _sum: { spent: true },
  });
  const results = await Promise.all([
    send("settle", { id }),
    send("settle", { id }),
    send("settle", { id }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(
    results.filter((r) => r.status !== 200).every((r) => r.status === 409),
  );
  const after = await db.fundingCommitment.aggregate({ _sum: { spent: true } });
  assert.equal(after._sum.spent! - before._sum.spent!, 300);
  assert.equal(
    await db.settlementRecord.count({ where: { transactionId: id } }),
    1,
  );
});
test("expiration releases reserved funds and prevents settlement", async () => {
  const id = await createAuthorized();
  await db.transaction.update({
    where: { id },
    data: { expiresAt: new Date(0) },
  });
  await login("hcmc-user");
  assert.equal((await send("settle", { id })).status, 409);
  const t = await db.transaction.findUnique({ where: { id } });
  assert.equal(t?.state, "EXPIRED");
});
test("rejection releases funds with no settlement", async () => {
  await login("hcmc-user");
  const before = await db.fundingCommitment.aggregate({
    _sum: { available: true },
  });
  const t = await send("propose", proposal);
  await login("hcmc-analyst");
  const r = await send("approve", {
    id: t.body.id,
    organizationId: "hcmc",
    decision: "REJECT",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.state, "REJECTED");
  const after = await db.fundingCommitment.aggregate({
    _sum: { available: true },
  });
  assert.equal(before._sum.available, after._sum.available);
});
test("amended draft can be corrected and re-proposed without releasing funds twice", async () => {
  await login("hcmc-user");
  const t = await send("propose", proposal);
  assert.equal(t.status, 201);
  assert.equal(
    (
      await send("amend", {
        id: t.body.id,
        proposal: { ...proposal, destination: "SIM-WRONG" },
      })
    ).status,
    200,
  );
  const before = await db.fundingCommitment.aggregate({
    _sum: { available: true },
  });
  assert.equal((await send("amend", { id: t.body.id, proposal })).status, 200);
  const after = await db.fundingCommitment.aggregate({
    _sum: { available: true },
  });
  assert.equal(before._sum.available, after._sum.available);
  assert.equal((await send("propose", proposal)).status, 201);
});
test("invalid destination and beneficiary cannot reserve any money", async () => {
  await login("hcmc-user");
  const before = await db.fundingCommitment.aggregate({
    _sum: { available: true, reserved: true },
  });
  assert.equal(
    (await send("propose", { ...proposal, destination: "OTHER" })).status,
    422,
  );
  assert.equal(
    (await send("propose", { ...proposal, beneficiaryId: "unknown" })).status,
    400,
  );
  const after = await db.fundingCommitment.aggregate({
    _sum: { available: true, reserved: true },
  });
  assert.deepEqual(before, after);
});
test("amendment clears all approvals and authorization and rotates nonce", async () => {
  const id = await createAuthorized();
  const before = await db.transaction.findUniqueOrThrow({ where: { id } });
  await login("hcmc-user");
  const r = await send("amend", { id, proposal: { ...proposal, amount: 301 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.state, "DRAFT");
  assert.equal(r.body.approvals.length, 0);
  assert.equal(r.body.authorization, null);
  assert.notEqual(r.body.nonce, before.nonce);
  assert.equal(r.body.allocations.length, 0);
  assert.equal((await send("settle", { id })).status, 409);
});
test("authorization provider mismatch cannot be settled", async () => {
  const id = await createAuthorized();
  await db.authorizationRecord.update({
    where: { transactionId: id },
    data: { provider: "tide-forseti" },
  });
  await login("hcmc-user");
  assert.equal((await send("settle", { id })).status, 409);
  assert.equal(
    await db.settlementRecord.count({ where: { transactionId: id } }),
    0,
  );
});
test("expired commitment invalidates authorization and releases every reservation", async () => {
  const id = await createAuthorized();
  const allocations = await db.transactionAllocation.findMany({
    where: { transactionId: id },
  });
  const c = await db.fundingCommitment.findUniqueOrThrow({
    where: { id: allocations[0].commitmentId },
  });
  await db.fundingCommitment.update({
    where: { id: c.id },
    data: { expiresAt: new Date(0) },
  });
  await login("hcmc-user");
  assert.equal((await send("settle", { id })).status, 409);
  assert.equal(
    (await db.transaction.findUniqueOrThrow({ where: { id } })).state,
    "EXPIRED",
  );
  await db.fundingCommitment.update({
    where: { id: c.id },
    data: { expiresAt: c.expiresAt },
  });
});
test("concurrent full-balance proposals reserve funds only once", async () => {
  await login("hcmc-user");
  const available = (
    await db.fundingCommitment.aggregate({ _sum: { available: true } })
  )._sum.available!;
  const results = await Promise.all([
    send("propose", { ...proposal, amount: available }),
    send("propose", { ...proposal, amount: available }),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 422).length, 1);
  for (const c of await db.fundingCommitment.findMany()) {
    assert.ok(c.available >= 0);
    assert.ok(c.reserved >= 0);
    assert.equal(c.amount, c.available + c.reserved + c.spent);
  }
});
