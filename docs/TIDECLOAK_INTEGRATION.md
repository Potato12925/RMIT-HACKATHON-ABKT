# TideCloak / Forseti integration status

Research date: 22 October 2026. **Mock prototype works independently of Tide provisioning; live integration is not implemented or verified.** The supplied provisioning blocker is `Midgard.FinalizeWallet HTTP 500`. This session did not reproduce, fix, or provision a realm.

## Actual MCP retrieval

The official entrypoint https://docs.tide.org/ai-agent-pack identified the hosted endpoint `https://mcp.tide.org/mcp` and package `@tideorg/mcp`. JSON-RPC `initialize` returned server `@tideorg/mcp` **1.9.33**. `tools/list` and `tools/call` were invoked directly over HTTPS (SSE JSON-RPC responses), not emulated from web snippets. Original results and readable text are in `docs/research`.

Retrieved tools:

- `tide_choose_scenario`: new Next.js conditional multi-organization funding and signing.
- `tide_playbook`: `add-auth-nextjs-fresh`, `protect-api-nextjs`, `add-rbac-nextjs`, `verify-jwt-server-side`, `deploy-forseti-policy`.
- `tide_canon`: `invariants`, `concepts`.

The responses cover OIDC integration, client/server protection, token/session security, RBAC, IGA/QEA concepts, Forseti policy signing and security checks. These are research artifacts, not evidence of live authentication or a successful signature.

## Important guidance and conflict resolution

Real integration requires a configured Tide realm and Tide-specific exported adapter containing embedded `jwk`, `vendorId`, and `homeOrkUrl`. Use the pinned embedded key for server token verification; do not fetch remote JWKS as a fallback. Verify issuer, authorized client (`azp`), time bounds and roles. Use PKCE and strict DPoP with the exact SDK relay asset, rewrite and CSP wiring.

The retrieved `protect-api-nextjs` text contains an older claim that app-side DPoP proof verification may be skipped. The newer `verify-jwt-server-side` Step 4 explicitly corrects that advice: verify RFC 9449 proof signature, binding, method, URL, time, access-token hash and replay identifier. This project does not implement the unsafe shortcut. Activation requires the shipped tested verifier and a suitable replay store; a `cnf.jkt` presence check alone is insufficient.

QEA/IGA governance and transaction-specific Forseti signing are different policy systems. Enabling governed role changes alone does not cryptographically authorize this application's payments. Forseti policy signatures require the documented browser/enclave approval flow. The retrieved deployment playbook states custom signing contracts are experimental/test-network and require Tide-team review/deployment; no deployment or signature is fabricated here.

## Current adapters

`MockTideCloakAuthProvider` creates 32-byte opaque random IDs, stores only their SHA-256 digests in SQLite, sets HttpOnly/SameSite cookies, expires sessions after eight hours, and invalidates the active session on logout. Memberships and roles are loaded from the database on each request. This is explicitly local demo identity selection, not OIDC.

`RealTideCloakAuthProvider` is a fail-closed integration boundary returning 503. It does not pretend to implement OIDC without a realm/adapter. `TIDECLOAK_MODE=real` never falls back. Mock mode is accepted only when NODE_ENV is development or test; production returns 503 before protected functionality.

`MockTransactionAuthorizationProvider` validates unanimous organization approvals, independent reviewer conditions, exact canonical payload, current restrictions and expiry. Authorization rows are labeled `mock`, with no simulated signature bytes. `TideForsetiAuthorizationProvider` rejects all evidence until a real verifier is integrated. Real mode cannot accept mock records.

## API and permissions

`GET /api/accounts` is a development-only identity picker. `POST /api/login` establishes a demo session. All other endpoints require a session: `/api/snapshot`, `/api/logout`, `/api/preview`, `/api/propose`, `/api/commitment`, `/api/approve`, `/api/amend`, `/api/settle`. Mutations require JSON and an exact Origin match.

Admin can create commitments only for its organization. Admin/Analyst can review only their organization's allocations. Users can submit and inspect their own requests. Reviewers can inspect requests funded by their organization. Amendments are requester-only. Settlement requires ownership or a contributing reviewer, plus full backend authorization validation. Admin has no spending-policy override.

## Activation checklist

1. Resolve the reported Midgard provisioning failure with Tide. Obtain human license-email/terms consent before provisioning; select hosting deliberately. No credentials or legal acceptance were invented.
2. Create a configured realm, client and governed organizational roles; export the Tide adapter using the verified vendor endpoint. Protect secrets and adapter configuration.
3. Pin matching SDK/server versions; retrieve `tide_scaffold` and `tide_dpop_asset` to install exact relay/verification assets, PKCE login and secure token/session lifecycle. Run `tide_doctor` against the live configuration.
4. Replace the real authentication boundary with verified JWT/DPoP handling and authoritative subject-to-membership mapping. Test invalid/expired tokens, wrong issuer/client, missing proof, replay, logout and revocation.
5. Design and review a signing policy binding the exact TrustVault payload, contribution restrictions and independent organizations. Coordinate custom contract deployment with Tide if needed. Configure governed policy changes and genuine per-transaction approval collection.
6. Implement independent signature verification in the gateway against the intended policy/key/version and exact payload. Enforce expiry and nonce uniqueness at the settlement boundary. Reject all mock records.
7. Run live negative and concurrency tests and deployment review before enabling real mode. This remains simulated money even after authentication is connected.
