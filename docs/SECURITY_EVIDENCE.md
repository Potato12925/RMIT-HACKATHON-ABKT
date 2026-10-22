# Security evidence

Validation performed on 22 October 2026, Windows, Node.js 24.15.0, Prisma 6.19.0, Next.js 16.2.4.

| Check | Observed result |
|---|---|
| `npm run db:setup` | Schema generated/pushed and synthetic data seeded successfully |
| `npm test` | 23 passed, 0 failed, approximately 3.7 seconds |
| `npm run lint` | Exit 0, no findings |
| `npm run build` | Exit 0; TypeScript and production prerender complete |
| `npm run dev` | Listening on loopback port 3000 |
| Live browser Security lab | 34 / 34 HTTP exchanges matched expectations across all eight scenarios |
| Anonymous development `/api/snapshot` | HTTP 401, session missing/expired |
| Production `/api/accounts` | HTTP 503, mock disabled outside development |

The browser run included real 401/403/409/422 denials and HTTP 200 settlement, then restored HCMC User. It added 12m synthetic commitments and settled 12m; the original 12m remains available. Narrow 634px layout was visually inspected in the in-app browser. This is not a comprehensive device/accessibility audit.

## Test architecture

`tests/funding.test.ts` tests deterministic allocation, restrictions, commitment expiration, canonical hashing and state transitions. `tests/integration.test.ts` creates a unique temporary SQLite database, runs Prisma db push, seeds it, and invokes the actual API request handler with standard Request objects, real cookies and real database transactions. It deletes only its own uniquely named temporary database after disconnecting. No test mocks replace the policy, authentication, authorization or settlement implementation.

`src/lib/scenarios.ts` is shared by the browser Security lab and integration suite. In the browser, it issues actual fetch requests and records actual response statuses/body. Expected denials are successes for the security test; expected settlement returns HTTP 200.

The integration cases cover the eight required scenarios plus sign-in/out, expired sessions, production guard, real-mode fallback denial, CSRF, malformed data, ownership, duplicate approvals, independent verification, direct payload tampering, concurrent settlement, expiration, rejection, draft correction, invalid beneficiary/destination, amendment invalidation, provider mismatch and concurrent allocation.

## Research and review

Raziel MCP 1.9.33 responded to initialize, tools/list and eight tools/call requests. Original responses are retained under `docs/research`. No Tide realm was created, and no genuine Tide authorization was produced.

A separate static reviewer inspected API/service/authorization paths. It found a draft-repair workflow issue. The regression test reproduced HTTP 409 on a second amendment; allowing owner edits of DRAFT without a second reservation release fixed it, and the full suite passed. It asked whether independence is universal: the brief defines it per contribution, so that behavior is intentional. Centralized mock identities can always be operated by one person; the demo does not establish real-world independent authority.

The reviewer independently re-ran the draft regression (1 passed, 0 failed), confirmed the UI/API correction, and reported no remaining findings. The final rebuild initially encountered Windows EPERM because the running servers held Prisma's engine DLL; stopping those processes allowed generation and build. This is documented in the setup instructions.

## Installation observations

Initial dependency resolution with latest Tailwind selected 4.3.3, which required unavailable `enhanced-resolve@^5.24.1`. Tailwind and its PostCSS package were pinned to 4.1.18. A registry idle timeout required a retry using cached downloads; installation then completed. `package-lock.json` records the resolved versions.

Prisma's Windows schema engine initially failed with an empty error when creating a missing SQLite file. The schema validated successfully. Creating the file in non-truncating append mode allowed db push; the setup script and isolated test setup now do this explicitly. Existing databases are preserved. Initial integration tests were blocked by this setup failure; after fixing it, 22/23 passed, exposing the draft-edit regression, then 23/23 passed after that correction. No genuine Tide tests were run.
