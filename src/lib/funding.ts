import { createHash } from "node:crypto";
import { ensure } from "./errors";
type Fund = {
  id: string;
  available: number;
  expiresAt: Date;
  restrictions: { category: string; beneficiaryId: string }[];
};
export function allocate(
  funds: Fund[],
  request: { amount: number; category: string; beneficiaryId: string },
) {
  ensure(
    Number.isSafeInteger(request.amount) && request.amount > 0,
    400,
    "Amount must be positive integer VND",
  );
  let remaining = request.amount;
  const result: { commitmentId: string; amount: number }[] = [];
  const eligible = [...funds]
    .filter(
      (f) =>
        f.available > 0 &&
        f.expiresAt > new Date() &&
        f.restrictions.some(
          (r) =>
            r.category === request.category &&
            r.beneficiaryId === request.beneficiaryId,
        ),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  let capacity = eligible.reduce((s, f) => s + f.available, 0);
  ensure(
    capacity >= remaining,
    422,
    `Funding policy rejected: ${Math.max(0, remaining - capacity).toLocaleString()} VND has no eligible funding`,
  );
  for (const f of eligible) {
    const amount = Math.min(
      f.available,
      Math.floor((remaining * f.available) / capacity),
    );
    if (amount > 0) {
      result.push({ commitmentId: f.id, amount });
      remaining -= amount;
    }
    capacity -= f.available;
  }
  ensure(
    remaining === 0,
    422,
    `Funding policy rejected: ${remaining.toLocaleString()} VND has no eligible funding`,
  );
  return result;
}
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function payloadHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
const transitions: Record<string, string[]> = {
  DRAFT: ["PROPOSED"],
  PROPOSED: ["PENDING_APPROVAL", "FAILED"],
  PENDING_APPROVAL: ["AUTHORIZED", "REJECTED", "EXPIRED", "DRAFT"],
  AUTHORIZED: ["SETTLED", "EXPIRED", "DRAFT", "FAILED"],
  REJECTED: [],
  EXPIRED: [],
  SETTLED: [],
  FAILED: [],
};
export function transition(from: string, to: string) {
  ensure(
    transitions[from]?.includes(to),
    409,
    `Invalid transition: ${from} → ${to}`,
  );
  return to;
}
