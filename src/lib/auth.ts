import { randomBytes, createHash } from "node:crypto";
import { db } from "./db";
import { ensure, AppError } from "./errors";
export const sessionCookie = "trustvault_session";
export function mockGuard(
  env = process.env.NODE_ENV,
  mode = process.env.TIDECLOAK_MODE ?? "mock",
) {
  ensure(
    mode === "mock" || mode === "real",
    503,
    "Invalid authentication mode",
  );
  if (mode === "mock")
    ensure(
      env === "development" || env === "test",
      503,
      "Mock authentication is disabled outside development",
    );
  return mode;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class MockTideCloakAuthProvider {
  async signIn(userId: string) {
    mockGuard();
    ensure(
      await db.user.findUnique({ where: { id: userId } }),
      401,
      "Unknown demo account",
    );
    const token = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        id: digest(token),
        userId,
        expiresAt: new Date(Date.now() + 8 * 3600_000),
      },
    });
    return token;
  }
  async resolve(token: string) {
    mockGuard();
    const session = await db.session.findUnique({
      where: { id: digest(token) },
      include: {
        user: { include: { memberships: { include: { organization: true } } } },
      },
    });
    ensure(
      session && session.expiresAt > new Date(),
      401,
      "Session missing or expired",
    );
    return session.user;
  }
  async signOut(token: string) {
    await db.session.deleteMany({ where: { id: digest(token) } });
  }
}
export class RealTideCloakAuthProvider {
  async signIn(_userId: string): Promise<string> {
    throw new AppError(
      503,
      "Real TideCloak unavailable: provisioning and verified adapter required",
    );
  }
  async resolve(_token: string): Promise<Actor> {
    throw new AppError(503, "Real TideCloak unavailable: no mock fallback");
  }
  async signOut(_token: string) {
    throw new AppError(503, "Real TideCloak unavailable");
  }
}
export type Actor = Awaited<ReturnType<MockTideCloakAuthProvider["resolve"]>>;
export function authProvider() {
  return mockGuard() === "mock"
    ? new MockTideCloakAuthProvider()
    : new RealTideCloakAuthProvider();
}
export function requireRole(actor: Actor, org: string, roles: string[]) {
  ensure(
    actor.memberships.some(
      (m) => m.organizationId === org && roles.includes(m.role),
    ),
    403,
    "Permission denied for this organization",
  );
}
export function reviewerOrOwner(
  actor: Actor,
  t: {
    creatorId: string;
    allocations: { commitment: { organizationId: string } }[];
  },
) {
  ensure(
    t.creatorId === actor.id ||
      t.allocations.some((a) =>
        actor.memberships.some(
          (m) =>
            m.organizationId === a.commitment.organizationId &&
            ["ADMIN", "ANALYST"].includes(m.role),
        ),
      ),
    403,
    "This transaction belongs to another user or organization",
  );
}
