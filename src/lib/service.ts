import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { Actor, requireRole, reviewerOrOwner } from "./auth";
import { ensure } from "./errors";
import { allocate, payloadHash, transition } from "./funding";
import {
  authorizationProvider,
  exactPayload,
  missingApprovals,
  transactionInclude,
  validatePayload,
  FullTransaction,
} from "./authorization";
export type Proposal = {
  beneficiaryId: string;
  amount: number;
  category: string;
  destination: string;
  description: string;
  evidence: string;
};
export async function atomic<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(fn, { maxWait: 10000, timeout: 15000 });
    } catch (e) {
      if (
        i < 3 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2028", "P1008"].includes(e.code)
      ) {
        await new Promise((r) => setTimeout(r, 40 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  detail: string,
  transactionId?: string,
) {
  await tx.auditEvent.create({
    data: { actorId, action, detail, transactionId },
  });
}
async function get(tx: Prisma.TransactionClient, id: string) {
  const t = await tx.transaction.findUnique({
    where: { id },
    include: transactionInclude,
  });
  ensure(t, 404, "Transaction not found");
  return t;
}
async function release(tx: Prisma.TransactionClient, t: FullTransaction) {
  for (const a of t.allocations) {
    const r = await tx.fundingCommitment.updateMany({
      where: { id: a.commitmentId, reserved: { gte: a.amount } },
      data: {
        reserved: { decrement: a.amount },
        available: { increment: a.amount },
      },
    });
    ensure(r.count === 1, 409, "Reservation mismatch");
  }
}
export async function expireTransactions() {
  return atomic(async (tx) => {
    const list = await tx.transaction.findMany({
      where: {
        state: { in: ["PENDING_APPROVAL", "AUTHORIZED"] },
        OR: [
          { expiresAt: { lte: new Date() } },
          {
            allocations: {
              some: { commitment: { expiresAt: { lte: new Date() } } },
            },
          },
        ],
      },
      include: transactionInclude,
    });
    for (const t of list) {
      await release(tx, t);
      await tx.transaction.update({
        where: { id: t.id },
        data: { state: transition(t.state, "EXPIRED") },
      });
      await audit(tx, "system", "EXPIRED", "Reservations released", t.id);
    }
  });
}
export async function preview(input: Proposal) {
  return allocate(
    await db.fundingCommitment.findMany({ include: { restrictions: true } }),
    input,
  );
}
export async function propose(actor: Actor, input: Proposal) {
  return atomic(async (tx) => {
    const beneficiary = await tx.beneficiary.findUnique({
      where: { id: input.beneficiaryId },
    });
    ensure(beneficiary, 400, "Beneficiary not found");
    ensure(
      input.destination === beneficiary.account,
      422,
      "Destination must match the registered beneficiary account",
    );
    const allocations = allocate(
      await tx.fundingCommitment.findMany({ include: { restrictions: true } }),
      input,
    );
    for (const a of allocations) {
      const update = await tx.fundingCommitment.updateMany({
        where: { id: a.commitmentId, available: { gte: a.amount } },
        data: {
          available: { decrement: a.amount },
          reserved: { increment: a.amount },
        },
      });
      ensure(
        update.count === 1,
        409,
        "Funds were reserved by another request; retry",
      );
    }
    let t = await tx.transaction.create({
      data: {
        ...input,
        creatorId: actor.id,
        nonce: randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 3600_000),
        state: "DRAFT",
        allocations: { create: allocations },
      },
      include: transactionInclude,
    });
    await audit(tx, actor.id, "DRAFT", "Synthetic request created", t.id);
    await tx.transaction.update({
      where: { id: t.id },
      data: { state: transition(t.state, "PROPOSED") },
    });
    await audit(tx, actor.id, "PROPOSED", "Funding reserved atomically", t.id);
    t = await tx.transaction.update({
      where: { id: t.id },
      data: {
        state: transition("PROPOSED", "PENDING_APPROVAL"),
        payloadHash: payloadHash(exactPayload(t)),
      },
      include: transactionInclude,
    });
    await audit(
      tx,
      actor.id,
      "PENDING_APPROVAL",
      "One approval required from each contributing organization",
      t.id,
    );
    return t;
  });
}
export async function approve(
  actor: Actor,
  id: string,
  organizationId: string,
  decision: "APPROVE" | "REJECT",
) {
  return atomic(async (tx) => {
    requireRole(actor, organizationId, ["ADMIN", "ANALYST"]);
    const t = await get(tx, id);
    reviewerOrOwner(actor, t);
    ensure(
      t.state === "PENDING_APPROVAL",
      409,
      "Transaction is not pending approval",
    );
    validatePayload(t);
    const allocation = t.allocations.filter(
      (a) => a.commitment.organizationId === organizationId,
    );
    ensure(
      allocation.length,
      403,
      "Organization does not fund this transaction",
    );
    ensure(
      !allocation.some((a) => a.commitment.independentVerification) ||
        actor.id !== t.creatorId,
      403,
      "Independent reviewer must differ from requester",
    );
    ensure(
      !t.approvals.some((a) => a.organizationId === organizationId),
      409,
      "Organization already reviewed this payload",
    );
    await tx.transactionApproval.create({
      data: {
        transactionId: id,
        organizationId,
        userId: actor.id,
        payloadHash: t.payloadHash,
        decision,
      },
    });
    await audit(
      tx,
      actor.id,
      decision,
      `${organizationId} reviewed exact payload ${t.payloadHash}`,
      id,
    );
    if (decision === "REJECT") {
      await release(tx, t);
      return tx.transaction.update({
        where: { id },
        data: { state: transition(t.state, "REJECTED") },
        include: transactionInclude,
      });
    }
    const updated = await get(tx, id);
    if (missingApprovals(updated).length === 0) {
      ensure(
        authorizationProvider().name === "mock",
        503,
        "Real signing is not configured",
      );
      await tx.authorizationRecord.create({
        data: {
          transactionId: id,
          provider: "mock",
          payloadHash: updated.payloadHash,
          expiresAt: updated.expiresAt,
        },
      });
      await tx.transaction.update({
        where: { id },
        data: { state: transition(updated.state, "AUTHORIZED") },
      });
      await audit(
        tx,
        actor.id,
        "AUTHORIZED",
        "Simulated quorum only — no Tide signature",
        id,
      );
    }
    return get(tx, id);
  });
}
export async function amend(actor: Actor, id: string, input: Proposal) {
  return atomic(async (tx) => {
    const t = await get(tx, id);
    ensure(
      actor.id === t.creatorId,
      403,
      "Only the requester may amend a transaction",
    );
    ensure(
      ["DRAFT", "PENDING_APPROVAL", "AUTHORIZED"].includes(t.state),
      409,
      "Transaction cannot be amended",
    );
    if (t.state !== "DRAFT") await release(tx, t);
    await tx.transactionApproval.deleteMany({ where: { transactionId: id } });
    await tx.authorizationRecord.deleteMany({ where: { transactionId: id } });
    await tx.transactionAllocation.deleteMany({ where: { transactionId: id } });
    const result = await tx.transaction.update({
      where: { id },
      data: {
        ...input,
        state: t.state === "DRAFT" ? "DRAFT" : transition(t.state, "DRAFT"),
        payloadHash: "",
        nonce: randomUUID(),
      },
      include: transactionInclude,
    });
    await audit(
      tx,
      actor.id,
      "AMENDED",
      "Approvals invalidated; reservations released. Submit a new proposal to allocate again.",
      id,
    );
    return result;
  });
}
export async function settle(actor: Actor, id: string) {
  return atomic(async (tx) => {
    const t = await get(tx, id);
    reviewerOrOwner(actor, t);
    ensure(
      t.state === "AUTHORIZED",
      409,
      "Settlement requires authorization; replay or missing quorum rejected",
    );
    authorizationProvider().verify(t);
    ensure(!t.settlement, 409, "Transaction already settled");
    for (const a of t.allocations) {
      const result = await tx.fundingCommitment.updateMany({
        where: { id: a.commitmentId, reserved: { gte: a.amount } },
        data: {
          reserved: { decrement: a.amount },
          spent: { increment: a.amount },
        },
      });
      ensure(result.count === 1, 409, "Insufficient reserved funds");
    }
    await tx.settlementRecord.create({
      data: { transactionId: id, nonce: t.nonce, amount: t.amount },
    });
    await tx.transaction.update({
      where: { id },
      data: { state: transition(t.state, "SETTLED") },
    });
    await audit(
      tx,
      actor.id,
      "SETTLED",
      "Simulated ledger settlement. No money moved.",
      id,
    );
    return get(tx, id);
  });
}
export async function snapshot(actor: Actor) {
  await expireTransactions();
  const orgIds = actor.memberships
    .filter((m) => ["ADMIN", "ANALYST"].includes(m.role))
    .map((m) => m.organizationId);
  const [organizations, beneficiaries, transactions] = await Promise.all([
    db.organization.findMany({
      include: {
        memberships: {
          select: { role: true, user: { select: { name: true } } },
        },
        commitments: { include: { restrictions: true } },
      },
    }),
    db.beneficiary.findMany(),
    db.transaction.findMany({
      where: {
        OR: [
          { creatorId: actor.id },
          {
            allocations: {
              some: { commitment: { organizationId: { in: orgIds } } },
            },
          },
        ],
      },
      include: transactionInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    user: actor,
    organizations,
    beneficiaries,
    transactions: transactions.map((t) => ({
      ...t,
      missingApprovals: missingApprovals(t),
      exactPayload: exactPayload(t),
    })),
    mode: process.env.TIDECLOAK_MODE ?? "mock",
  };
}
