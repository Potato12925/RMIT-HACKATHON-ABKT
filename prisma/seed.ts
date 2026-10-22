import { PrismaClient } from "@prisma/client";
export async function seed(db: PrismaClient) {
  const orgs = [
    ["hcmc", "HCMC Fund", "Ho Chi Minh City", 5_000_000],
    ["hanoi", "Hanoi Fund", "Hanoi", 5_000_000],
    ["melbourne", "Melbourne Fund", "Melbourne", 2_000_000],
  ] as const;
  await db.beneficiary.upsert({
    where: { id: "linh" },
    update: {},
    create: {
      id: "linh",
      name: "Linh Nguyen · synthetic beneficiary",
      account: "SIM-VN-2026-001",
    },
  });
  for (const [id, name, city, amount] of orgs) {
    await db.organization.upsert({
      where: { id },
      update: {},
      create: { id, name, city },
    });
    for (const role of ["ADMIN", "ANALYST", "USER"]) {
      const userId = `${id}-${role.toLowerCase()}`;
      await db.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          name: `${city} ${role.toLowerCase()}`,
          email: `${userId}@demo.trustvault.local`,
          memberships: { create: { organizationId: id, role } },
        },
      });
    }
    await db.fundingCommitment.upsert({
      where: { id: `seed-${id}` },
      update: {},
      create: {
        id: `seed-${id}`,
        organizationId: id,
        amount,
        available: amount,
        expiresAt: new Date("2027-12-31"),
        independentVerification: id === "melbourne",
        restrictions: {
          create: (id === "hanoi" ? ["MEDICAL", "EDUCATION"] : ["MEDICAL"]).map(
            (category) => ({ category, beneficiaryId: "linh" }),
          ),
        },
      },
    });
  }
  for (const [id, amount, category, description] of [
    ["demo-medical", 12_000_000, "MEDICAL", "Collaborative medical assistance"],
    [
      "demo-travel",
      12_000_000,
      "TRAVEL",
      "Invalid request: restricted funds cannot pay for travel",
    ],
    [
      "demo-overbudget",
      15_000_000,
      "MEDICAL",
      "Invalid request: exceeds committed funding",
    ],
  ] as const) {
    await db.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        creatorId: "hcmc-user",
        beneficiaryId: "linh",
        amount,
        category,
        destination: "SIM-VN-2026-001",
        description,
        evidence: "SYNTHETIC-INVOICE-2026",
        nonce: `seed-${id}`,
        expiresAt: new Date("2027-12-31"),
        state: "DRAFT",
      },
    });
  }
}
if (process.argv[1]?.endsWith("seed.ts")) {
  const db = new PrismaClient();
  seed(db)
    .then(() =>
      console.log(
        "Seeded synthetic organizations, accounts, commitments and draft requests.",
      ),
    )
    .finally(() => db.$disconnect());
}
