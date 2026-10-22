Multiple scenarios match "New Next.js TrustVault multi-organization conditional funding with transaction-specific quorum signing. Development mock required because Midgard.FinalizeWallet HTTP 500; research only, no realm provisioning." (I-17 — resolve before proceeding):

- **iga-admin-governance** (IGA Admin Governance Panel, score 1)
  Disambiguate: Does the app need a custom admin UI for reviewing and approving IGA change requests (user/role/group/client mutations)? If the built-in TideCloak Admin Console is sufficient, this scenario is not needed.
- **policy-governed-signing** (Policy-Governed Signing, score 1)  ← its Forseti contract is deployed by the Tide team
  Disambiguate: Does the app produce cryptographic signatures (SSH challenges, document signing, transaction approval)? If the app encrypts/decrypts data instead, use an encryption scenario.

Resolve the ambiguity before selecting a playbook path.
