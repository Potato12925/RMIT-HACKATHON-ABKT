# TrustVault

**One Transaction. Multiple Authorities. No Single Controller.**

### RMIT Hackathon 2026 — Challenge 2: UNLOCKED

TrustVault is a local prototype for organizations that want to fund one shared outcome without handing control of their contributions to a single organization. Each contribution keeps its own spending rules, and every organization funding a transaction must approve the same transaction before the demo ledger can settle it.

The project explores how TideCloak identity and governed authorization, together with Forseti signing policies, could provide the identity and cryptographic authority layer for this workflow. **For the hackathon demo, the organizers permitted a TideCloak integration simulation because the Tide server was overloaded.** The current app therefore demonstrates the integration boundary and intended authorization flow with local mock providers. It does not claim that a live TideCloak realm, Tide identity token, or Forseti signature was used.

## The problem TrustVault addresses

Pooling funds can erase the conditions attached to each contribution. TrustVault keeps those conditions visible and enforceable throughout one collaborative request:

- HCMC's contribution is restricted to medical assistance.
- Hanoi's contribution can fund medical or education requests.
- Melbourne's contribution requires an independent reviewer, different from the requester.

A shared balance is not shared authority. The application first determines which contributions are eligible, then requires approval from every organization allocated to the request. A 12,000,000 VND medical request for one beneficiary can be funded by three organizations without treating their policies as interchangeable.

## How a transaction works

1. **Organizations define mandates.** An Admin creates a synthetic commitment for their organization with an amount, allowed categories, beneficiary scope, expiry, and any independent-review requirement.
2. **A requester proposes a transaction.** The request specifies the beneficiary, amount, purpose, destination, description, and synthetic evidence reference.
3. **The policy engine checks eligibility.** It filters contributions by category, beneficiary, expiry, and available balance. Eligible funds are allocated deterministically. Reservations and audit events are written atomically, so failed requests do not partially reserve funds.
4. **Each contributing organization reviews the same payload.** Analysts can approve only their organization's allocation. The canonical transaction payload includes the material request fields and allocation; approvals are bound to its SHA-256 hash. Melbourne's independent reviewer must not be the requester.
5. **The authorization boundary checks the quorum.** Settlement is allowed only when every contributing organization has approved the current payload and the policies, hash, expiry, and authorization state remain valid. Amending a request invalidates earlier approvals; replaying settlement is rejected.
6. **The local ledger simulates settlement.** The demo records the synthetic debit, settlement, and audit history. It never contacts a bank, payment network, or real beneficiary.

The backend—not browser-submitted roles or amounts—is authoritative for session membership, role checks, policy evaluation, allocation, approval, and settlement. No LLM makes a policy decision.

## How TrustVault relates to TideCloak and Forseti

The intended integration separates identity from transaction authority:

| Concern | TideCloak / Forseti role in the intended design | What this prototype demonstrates |
| --- | --- | --- |
| Identity | TideCloak authenticates a person and provides a governed identity context. | A local identity picker creates opaque server-side sessions; memberships and roles are loaded from SQLite. |
| Organizational authority | Governed roles and authorization policies represent who may act for each organization. | Server-side Admin, Analyst, and User permissions limit each action to the appropriate organization and transaction. |
| Exact transaction approval | A reviewed Forseti policy/signing flow would authorize the exact transaction under the required organizational rules. | Local mock approvals bind to the canonical payload hash and require unanimous approval from contributing organizations. |
| Settlement enforcement | A production integration would independently verify genuine policy/signature evidence at the settlement boundary. | The authorization adapter validates mock approval records and the simulated ledger settles only after the checks pass. |

This is a **permitted simulation of the TideCloak/Forseti integration concept**, not a live Tide security integration. The demo's local accounts are selectable identities, all mock approval rows are explicitly labeled, and the backend/database remain trusted. The prototype does not create or verify Tide tokens, DPoP proofs, QEA/IGA governance, Forseti signatures, or decentralized authorization. Official Raziel MCP integration guidance was retrieved and is documented, but live Tide provisioning/integration was not completed; the reported Tide service issue was `Midgard.FinalizeWallet HTTP 500` during the work. See [TideCloak integration status](docs/TIDECLOAK_INTEGRATION.md) for the precise boundary and the steps required to activate a real integration.

## What the video demo shows

The recorded walkthrough presents the complete application flow and its API evidence:

- One 12,000,000 VND medical request funded by HCMC, Hanoi, and Melbourne.
- Organization-specific approvals and the independent-review condition.
- Simulated settlement after the required approvals.
- Security Lab calls to the real local API, showing allowed requests and expected denials such as HTTP 401, 403, 409, and 422.
- Amendment invalidation, missing-quorum rejection, and replay rejection.

In the Security Lab, a red HTTP status is an expected denial when its row has a green check and says **Matched**. The lab runs 34 HTTP exchanges across eight scenarios, adds 12,000,000 synthetic VND in commitments, retains audit history, and restores the identity that launched it. It is repeatable, but each run adds synthetic history; run it against the seeded medical-only policies for the travel-denial scenario. These checks demonstrate centralized application controls, not Tide cryptographic enforcement.

All organizations, identities, balances, transactions, and evidence references are synthetic. No bank or payment network is connected.

## Run locally

Requires Node.js 22+ and npm. From this directory:

```powershell
npm install
Copy-Item .env.example .env  # first setup only
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The server binds to loopback. `APP_ORIGIN` must match the browser origin exactly; use `localhost` rather than `127.0.0.1` with the supplied configuration. Database setup is additive/idempotent and does not reset existing balances.

```powershell
npm test
npm run lint
npm run build
```

The build compiles in production mode, but **`npm start` intentionally refuses protected mock functionality**. Use `npm run dev` for the demo. Setting real mode does not activate an incomplete integration: it returns 503 without fallback.

On Windows, stop running dev/production servers before `db:setup` or `build`: Prisma cannot replace its generated engine DLL while another process has it loaded.

## Demo identities

Each organization has an Admin, Analyst, and User. Select an account on the login screen; no demo password is needed. IDs are `{hcmc|hanoi|melbourne}-{admin|analyst|user}`; emails are `<id>@demo.trustvault.local`. Roles and organizations come from server-side memberships, never client claims.

- **Admin:** creates commitments for their organization and reviews its allocated requests.
- **Analyst:** reviews transactions funded by their organization.
- **User:** proposes requests and tracks their own transactions.
- **Independent verification:** Melbourne's reviewer must differ from the requester.

For the main walkthrough, sign in as HCMC User and propose the seeded medical request. Sign out and approve as each organization's Analyst, then return to the requester to simulate settlement. The Security Lab automates attack and success scenarios and restores your identity when it finishes.

## Project map

- `src/app` — Next.js shell, styling, and API routes.
- `src/components` — connected workspace and live Security Lab.
- `src/lib` — sessions, RBAC, deterministic funding, authorization, service transactions, and API validation.
- `prisma` — schema and additive seed.
- `tests` — policy tests and isolated SQLite request-handler integration tests.
- `docs/research` — retrieved Raziel tool responses.

See [Architecture](docs/ARCHITECTURE.md), [TideCloak integration](docs/TIDECLOAK_INTEGRATION.md), [Threat model](docs/THREAT_MODEL.md), [Security evidence](docs/SECURITY_EVIDENCE.md), and the [two-minute demo script](docs/DEMO_SCRIPT.md).

## Limits

This is a local development simulation. Anyone with local demo access can select any seeded identity. The backend and database remain trusted; an attacker controlling them can bypass the centralized model. Hashes detect mismatches but are not decentralized signatures. There is no real authentication, QEA deployment, Forseti signature, bank integration, or legally verified eligibility. Evidence references are synthetic strings, not verified documents. SQLite is appropriate for this single-process hackathon demonstration; production requires a threat-modelled deployment, live Tide integration, operational controls, and further testing.
