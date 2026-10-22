import { ensure, AppError } from "./errors";
import { payloadHash } from "./funding";
import { mockGuard } from "./auth";
import type { Prisma } from "@prisma/client";
export const transactionInclude = {
  allocations: {
    include: {
      commitment: { include: { restrictions: true, organization: true } },
    },
  },
  approvals: {
    include: { user: { include: { memberships: true } }, organization: true },
  },
  authorization: true,
  settlement: true,
  beneficiary: true,
  audit: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.TransactionInclude;
export type FullTransaction = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;
export function exactPayload(t: FullTransaction) {
  return {
    id: t.id,
    creatorId: t.creatorId,
    beneficiaryId: t.beneficiaryId,
    amount: t.amount,
    category: t.category,
    destination: t.destination,
    description: t.description,
    evidence: t.evidence,
    nonce: t.nonce,
    expiresAt: t.expiresAt.toISOString(),
    allocations: t.allocations
      .map((a) => ({ commitmentId: a.commitmentId, amount: a.amount }))
      .sort((a, b) => a.commitmentId.localeCompare(b.commitmentId)),
  };
}
export function validatePayload(t: FullTransaction) {
  ensure(t.expiresAt > new Date(), 409, "Transaction expired");
  ensure(
    t.payloadHash === payloadHash(exactPayload(t)),
    409,
    "Transaction tampering detected: payload hash mismatch",
  );
  ensure(
    t.allocations.reduce((s, a) => s + a.amount, 0) === t.amount &&
      t.allocations.length > 0,
    409,
    "Invalid funding allocation",
  );
  for (const a of t.allocations) {
    ensure(
      a.commitment.expiresAt > new Date(),
      409,
      "Funding commitment expired",
    );
    ensure(
      a.commitment.restrictions.some(
        (r) => r.category === t.category && r.beneficiaryId === t.beneficiaryId,
      ),
      422,
      "Funding restriction violated",
    );
    ensure(a.amount > 0, 409, "Invalid allocation");
  }
}
export function missingApprovals(t: FullTransaction) {
  return [
    ...new Set(t.allocations.map((a) => a.commitment.organizationId)),
  ].filter(
    (org) =>
      !t.approvals.some(
        (a) =>
          a.organizationId === org &&
          a.decision === "APPROVE" &&
          a.payloadHash === t.payloadHash &&
          a.user.memberships.some(
            (m) =>
              m.organizationId === org && ["ADMIN", "ANALYST"].includes(m.role),
          ) &&
          (!t.allocations.some(
            (x) =>
              x.commitment.organizationId === org &&
              x.commitment.independentVerification,
          ) ||
            a.userId !== t.creatorId),
      ),
  );
}
export class MockTransactionAuthorizationProvider {
  readonly name = "mock";
  verify(t: FullTransaction) {
    mockGuard();
    validatePayload(t);
    ensure(
      missingApprovals(t).length === 0,
      409,
      "Missing independent organization approvals",
    );
    ensure(
      t.authorization?.provider === "mock" &&
        t.authorization.payloadHash === t.payloadHash &&
        t.authorization.expiresAt > new Date(),
      409,
      "Valid simulated authorization required",
    );
  }
}
export class TideForsetiAuthorizationProvider {
  readonly name = "tide-forseti";
  verify(_t: FullTransaction): never {
    throw new AppError(
      503,
      "Forseti unavailable: verified policy and Tide network signature required; mock evidence is not accepted",
    );
  }
}
export function authorizationProvider() {
  return mockGuard() === "mock"
    ? new MockTransactionAuthorizationProvider()
    : new TideForsetiAuthorizationProvider();
}
