import { z } from "zod";
import { db } from "./db";
import { authProvider, sessionCookie, requireRole, mockGuard } from "./auth";
import { AppError, ensure } from "./errors";
import {
  propose,
  preview,
  approve,
  amend,
  settle,
  snapshot,
  audit,
  expireTransactions,
} from "./service";
const proposal = z
  .object({
    beneficiaryId: z.string().min(1),
    amount: z.number().int().positive().max(1_000_000_000),
    category: z.enum(["MEDICAL", "EDUCATION", "TRAVEL"]),
    destination: z.string().min(3).max(100),
    description: z.string().min(5).max(500),
    evidence: z.string().min(3).max(200),
  })
  .strict();
const tokenFrom = (r: Request) =>
  r.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(sessionCookie + "="))
    ?.slice(sessionCookie.length + 1) ?? "";
export async function handle(request: Request) {
  let actorId = "anonymous";
  try {
    mockGuard();
    const action = new URL(request.url).pathname.split("/").pop();
    const provider = authProvider();
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
      ensure(
        origin === expected,
        403,
        "CSRF rejected: same-origin request required",
      );
      ensure(
        request.headers.get("content-type")?.includes("application/json"),
        415,
        "JSON required",
      );
    }
    if (action === "accounts" && request.method === "GET") {
      ensure(
        process.env.TIDECLOAK_MODE !== "real",
        503,
        "Demo accounts unavailable in real mode",
      );
      return Response.json(
        await db.user.findMany({
          select: {
            id: true,
            name: true,
            memberships: { include: { organization: true } },
          },
        }),
      );
    }
    const data = request.method === "GET" ? {} : await request.json();
    if (action === "login" && request.method === "POST") {
      const { userId } = z.object({ userId: z.string() }).strict().parse(data);
      const token = await provider.signIn(userId);
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": `${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
          },
        },
      );
    }
    const actor = await provider.resolve(tokenFrom(request));
    actorId = actor.id;
    if (action === "logout" && request.method === "POST") {
      await provider.signOut(tokenFrom(request));
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
          },
        },
      );
    }
    if (action === "snapshot" && request.method === "GET")
      return Response.json(await snapshot(actor), {
        headers: { "Cache-Control": "no-store" },
      });
    ensure(request.method === "POST", 405, "Method not allowed");
    await expireTransactions();
    if (action === "preview")
      return Response.json({
        allocations: await preview(proposal.parse(data)),
      });
    if (action === "propose")
      return Response.json(await propose(actor, proposal.parse(data)), {
        status: 201,
      });
    if (action === "approve") {
      const v = z
        .object({
          id: z.string(),
          organizationId: z.string(),
          decision: z.enum(["APPROVE", "REJECT"]),
        })
        .strict()
        .parse(data);
      return Response.json(
        await approve(actor, v.id, v.organizationId, v.decision),
      );
    }
    if (action === "amend") {
      const v = z.object({ id: z.string(), proposal }).strict().parse(data);
      return Response.json(await amend(actor, v.id, v.proposal));
    }
    if (action === "settle") {
      const v = z.object({ id: z.string() }).strict().parse(data);
      return Response.json(await settle(actor, v.id));
    }
    if (action === "commitment") {
      const v = z
        .object({
          organizationId: z.string(),
          amount: z.number().int().positive().max(1_000_000_000),
          categories: z
            .array(z.enum(["MEDICAL", "EDUCATION", "TRAVEL"]))
            .min(1),
          beneficiaryId: z.string(),
          expiresAt: z.iso.datetime(),
          independentVerification: z.boolean(),
        })
        .strict()
        .parse(data);
      requireRole(actor, v.organizationId, ["ADMIN"]);
      ensure(
        new Date(v.expiresAt) > new Date(),
        400,
        "Expiry must be in the future",
      );
      ensure(
        await db.beneficiary.findUnique({ where: { id: v.beneficiaryId } }),
        400,
        "Unknown beneficiary",
      );
      const result = await db.$transaction(async (tx) => {
        const commitment = await tx.fundingCommitment.create({
          data: {
            organizationId: v.organizationId,
            amount: v.amount,
            available: v.amount,
            expiresAt: new Date(v.expiresAt),
            independentVerification: v.independentVerification,
            restrictions: {
              create: [...new Set(v.categories)].map((category) => ({
                category,
                beneficiaryId: v.beneficiaryId,
              })),
            },
          },
        });
        await audit(
          tx,
          actor.id,
          "COMMITMENT_CREATED",
          `${v.organizationId}: ${v.amount} simulated VND`,
        );
        return commitment;
      });
      return Response.json(result, { status: 201 });
    }
    throw new AppError(404, "Endpoint not found");
  } catch (e) {
    const status =
      e instanceof AppError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : e instanceof SyntaxError
            ? 400
            : 500;
    const error =
      e instanceof AppError
        ? e.message
        : e instanceof z.ZodError
          ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
          : status === 400
            ? "Invalid JSON"
            : "Operation could not complete; retry after refreshing";
    if (status >= 400 && status !== 401) {
      await db.auditEvent
        .create({
          data: {
            actorId,
            action: "REQUEST_DENIED",
            detail: `HTTP ${status}: ${error}`,
          },
        })
        .catch(() => {});
    }
    return Response.json({ error }, { status });
  }
}
