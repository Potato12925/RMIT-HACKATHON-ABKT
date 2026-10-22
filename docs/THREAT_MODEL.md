# Threat model

## Trust boundaries and protected assets

Browser input crosses the API boundary; sessions and organization memberships are resolved on the server. The application/database boundary is trusted in mock mode. The proposed future Tide network is a separate cryptographic authority boundary, currently disconnected. Protected assets are synthetic commitment balances, transaction payloads, approval provenance, session IDs and settlement uniqueness.

## Attacker capabilities and checks

| Threat | Enforcement |
|---|---|
| Anonymous protected request | 401; expiring opaque session lookup |
| User claims Admin role | Strict input schemas; server-side memberships; 403 |
| One organization acts for another | Organization-specific role and allocation checks |
| IDOR / cross-user transaction | Owner or contributing-organization reviewer required |
| CSRF | Exact configured Origin required for JSON mutations; SameSite=Strict cookies |
| Session guessing / fixation | 256-bit random ID; SHA-256 stored server-side; new ID per login |
| Session reuse after logout / expiry | Session removal and expiry check |
| Invalid purpose or beneficiary | Structured per-contribution restrictions; registered destination check |
| Double allocation | Atomic transaction and conditional available-balance decrement |
| Missing quorum | One current eligible approval per contributing organization |
| Fake independence | Independent reviewer ID differs from requester |
| Payload changed after approval | Canonical hash check; amendments clear approval/authorization records |
| Replay / concurrent settlement | Authorized-state guard plus unique transaction and nonce records in atomic debit |
| Expired commitment/request | Reject allocation; release pending reservations and mark expired |
| Mock evidence in real mode | Separate fail-closed adapters; no fallback |
| Production mock use | Guard runs before protected API processing; returns 503 |

## Limits and residual risk

Mock identities have no identity proof; any local participant can select another demo account. One person can operate multiple identities, so organizational independence here is a database rule, not a proven real-world fact. A compromised backend or database can replace memberships, approvals, hashes and balances. Hashing is not signing. Audit events share the database and are not tamper-proof. Read-only synthetic directory data is deliberately shared.

HTTP on loopback is allowed for the local demo. HttpOnly and SameSite=Strict are always set; Secure is set when the request URL is HTTPS. A future reverse-proxy deployment needs trusted origin configuration, TLS, secure cookie policy, rate limits, authentication abuse protection, audit retention, backups, session cleanup, hardened CSP, and independently reviewed migrations. None of these turn mock identities into real authentication.

The evidence reference is not proof of medical eligibility, and destination validation uses a synthetic beneficiary record. No real personal information or money should be entered. Session lifespan is eight hours; logout invalidates the active session, not every device. Expiry cleanup runs during use. Tests do not establish security under backend compromise or real Tide interoperability.
