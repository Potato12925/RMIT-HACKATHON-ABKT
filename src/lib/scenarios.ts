export type Exchange = {
  label: string;
  action: string;
  status: number;
  expected: number;
  passed: boolean;
  body: unknown;
};
export type Transport = (
  action: string,
  body?: unknown,
  anonymous?: boolean,
) => Promise<{ status: number; body: Record<string, unknown> }>;
// Shared by the browser and automated HTTP tests; every assertion uses a real API response.
export async function runScenarios(
  send: Transport,
  record: (e: Exchange) => void,
) {
  async function request(
    label: string,
    action: string,
    body: unknown,
    expected: number,
    anonymous = false,
  ) {
    const r = await send(action, body, anonymous);
    record({
      label,
      action,
      status: r.status,
      expected,
      passed: r.status === expected,
      body: r.body,
    });
    if (r.status !== expected)
      throw new Error(`${label}: expected ${expected}, received ${r.status}`);
    return r.body;
  }
  async function login(id: string) {
    await request(`Sign in · ${id}`, "login", { userId: id }, 200);
  }
  const proposal = {
    beneficiaryId: "linh",
    amount: 12_000_000,
    category: "MEDICAL",
    destination: "SIM-VN-2026-001",
    description: "Security lab · collaborative medical assistance",
    evidence: "SYNTHETIC-LAB-INVOICE",
  };
  await request(
    "4 · Anonymous protected read",
    "snapshot",
    undefined,
    401,
    true,
  );
  await login("hcmc-user");
  const commitment = {
    organizationId: "hcmc",
    amount: 5_000_000,
    categories: ["MEDICAL"],
    beneficiaryId: "linh",
    expiresAt: "2027-12-31T00:00:00.000Z",
    independentVerification: false,
  };
  await request(
    "3 · User attempts Admin-only funding",
    "commitment",
    commitment,
    403,
  );
  // Each run adds exactly 12m synthetic funds so the scenario is repeatable without resets.
  for (const [org, amount] of [
    ["hcmc", 5_000_000],
    ["hanoi", 5_000_000],
    ["melbourne", 2_000_000],
  ] as const) {
    await login(`${org}-admin`);
    await request(
      `Prepare synthetic lab funding · ${org}`,
      "commitment",
      {
        ...commitment,
        organizationId: org,
        amount,
        independentVerification: org === "melbourne",
      },
      201,
    );
  }
  await login("hcmc-admin");
  await request(
    "2 · Admin attempts prohibited purpose",
    "propose",
    { ...proposal, category: "TRAVEL" },
    422,
  );
  await login("hcmc-user");
  const created = await request(
    "1 · Propose collaborative medical request",
    "propose",
    proposal,
    201,
  );
  const id = created.id;
  await login("hcmc-admin");
  await request(
    "5 · Cross-organization approval attempt",
    "approve",
    { id, organizationId: "hanoi", decision: "APPROVE" },
    403,
  );
  await request(
    "First independent approval",
    "approve",
    { id, organizationId: "hcmc", decision: "APPROVE" },
    200,
  );
  await request("8 · Missing quorum blocks settlement", "settle", { id }, 409);
  for (const org of ["hanoi", "melbourne"]) {
    await login(`${org}-analyst`);
    await request(
      `Approve exact payload · ${org}`,
      "approve",
      { id, organizationId: org, decision: "APPROVE" },
      200,
    );
  }
  await login("hcmc-user");
  await request(
    "6 · Amend destination after approvals",
    "amend",
    { id, proposal: { ...proposal, destination: "SIM-TAMPERED-ACCOUNT" } },
    200,
  );
  await request(
    "6 · Old approvals cannot settle amended payload",
    "settle",
    { id },
    409,
  );
  const valid = await request(
    "Re-propose original beneficiary destination",
    "propose",
    proposal,
    201,
  );
  for (const org of ["hcmc", "hanoi", "melbourne"]) {
    await login(`${org}-analyst`);
    await request(
      `Fresh approval · ${org}`,
      "approve",
      { id: valid.id, organizationId: org, decision: "APPROVE" },
      200,
    );
  }
  await login("hcmc-user");
  await request(
    "1 · Authorized simulated settlement",
    "settle",
    { id: valid.id },
    200,
  );
  await request(
    "7 · Replay cannot settle twice",
    "settle",
    { id: valid.id },
    409,
  );
}
