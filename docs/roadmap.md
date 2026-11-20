# Cosmos Gov Signer delivery roadmap

Updated 15 November 2026. This document summarizes the roadmap publicly; working items and blockers are tracked as drafts in the [private delivery project](https://github.com/users/m1ngshum/projects/6). Project access is required to view those items.

## How to use the project

Like Credspan Delivery, the project separates:

- **Status:** Backlog → Ready → Building → Review → Done.
- **Delivery stage:** Planned → Implemented → Merged → Deployed → Verified. For npm work, Deployed means published to the registry; it does not mean a consuming service is deployed.
- **Priority:** P0, P1, or P2, with P0 first.
- **Evidence:** Source PRs, Blocker, Phase, and an optional Target date. Leave dates unset until there is an agreed commitment.

Done means the item's defined scope is complete; its delivery stage says what was actually demonstrated. A merged fix is not automatically a published fix. An unverified dependency, missing authorization, or failed check stays visible as a blocker.

No item, target date, or plan authorizes merges, releases, credential/provider access, signing, or broadcasts. Obtain explicit authorization for each consequential execution stage and retain required CI/review gates.

## Current evidence

| Work | Status / stage | Evidence and limits |
| --- | --- | --- |
| R0 — npm release baseline | Done / Verified | All four 0.1.2 packages were installed from npm and checked with strict TypeScript, mocked integrations, registry signatures and provenance. [Release notes](https://github.com/m1ngshum/cosmos-gov-signer/releases/tag/v0.1.2), [publish run](https://github.com/m1ngshum/cosmos-gov-signer/actions/runs/41971688767). This was not live-chain acceptance. |
| 0.1.3 metadata patch | Published, with limited evidence here | All four npm latest versions report 0.1.3. [Publish run 42758382717](https://github.com/m1ngshum/cosmos-gov-signer/actions/runs/42758382717) succeeded at 2d7b96c. This review did not repeat its clean install or provenance checks. |
| R1 — input validation and discovery fixes | Done / Merged | [PR #39](https://github.com/m1ngshum/cosmos-gov-signer/pull/39), main commit 47af5d9, [CI run](https://github.com/m1ngshum/cosmos-gov-signer/actions/runs/43146303875). Build, typecheck, 103 tests and packaging passed; Astra and a focused source security review were completed. The fixes are not in the published 0.1.3 packages. |
| R9 — documentation and delivery tracking | Review / Implemented | [PR #43](https://github.com/m1ngshum/cosmos-gov-signer/pull/43) reconciles all repository Markdown guides and adds this roadmap. Static links/fences checks passed; Astra found no blockers. Merge remains unauthorized. |
| Live KMS and chain acceptance | Not verified | No production or testnet acceptance claim follows from package publication, mocked tests, or provenance. |

## Prioritized work

### R2 — Release the merged hardening fixes

**P0 · Ready · Planned · Phase: Release readiness**

Prepare the next coordinated patch from an explicitly reviewed source commit. Include the README corrections and PR #39's date, DER/SPKI, signer-address, and pagination changes.

Acceptance:

- Review the source-to-last-publish diff and bump all four versions; never reuse 0.1.3.
- Required PR and main CI pass, with authorized merge/release gates.
- Publish through the existing OIDC workflow only after release authorization.
- Verify each exact npm version, canonical tarball, provenance source/run/digest, clean consumer install, and registry signatures/attestations.
- Record any registry propagation delay without republishing an accepted version.

**Blocker:** no new npm release is currently authorized. This planning task must not dispatch the publish workflow.

### R3 — Establish chain-derived signing compatibility fixtures

**P1 · Ready · Planned · Phase: Signing correctness**

Validate the encoding boundary before changing it.

Acceptance:

- Obtain attributable chain/reference-tool fixtures with chain/software revision and reproducible inputs.
- Include metadata containing `&`, `<`, `>`, U+2028 and U+2029, alongside ordinary vote/proposal cases.
- Compare expected JSON/TypeAny bytes, EIP-712 digest, and signature verification behavior.
- Include mismatched protobuf/JSON and wrong-signer cases.
- Add offline regression fixtures. Change encoding only if reference evidence demonstrates a mismatch.

The [conformance suite](../conformance/README.md) includes reproducible delegated-vote fixtures from the pinned MOCA fork and native Cosmos SDK. Proposal submission and edge-case metadata escaping remain open. JavaScript/Go escaping differences are a compatibility hypothesis.

### R4 — Add a prepare-only acceptance harness

**P1 · Ready · Planned · Phase: Acceptance tooling**

Build a small opt-in harness around the published packages and document its inputs and evidence format.

Acceptance:

- Default operation uses synthetic/offline inputs and performs no provider request, signature, or broadcast.
- Validate target identity, approved message data, signer/public-key/address consistency, account values and fee inputs before preparing a transaction.
- Reuse fixtures from R3 where available; distinguish synthetic vectors from chain-derived ones.
- Document separate authorization gates for live reads, KMS signing, and broadcasting; no automatic fall-through between stages.
- Offline tests verify defaults, invalid input rejection, and that unauthorized stages cannot execute.

### R5 — Verify one KMS-backed testnet governance vote

**P1 · Backlog · Planned · Phase: Operational acceptance**

Acceptance:

- Complete R3/R4 prerequisites relevant to the selected transaction.
- Obtain explicit authorization for the selected testnet, RPC/LCD endpoints, dedicated KMS key, fee budget, grant, and each live execution stage.
- Verify network identity, current account state, key permissions, authz scope/expiry and fee funding.
- Verify the KMS signature locally before an authorized broadcast.
- Confirm inclusion, transaction execution result, and the recorded vote; a synchronous broadcast hash alone is not success.
- Exercise an uncertain response/retry without blindly signing or submitting twice, and retain sanitized evidence.

**Blocker:** provider configuration and live operations are not authorized by this roadmap; live acceptance remains unverified.

### R6 — Document and exercise durable consumer orchestration

**P1 · Backlog · Planned · Phase: Consumer integration**

Acceptance:

- Provide a minimal example/contract for distinct approver validation, chain/proposal deduplication, atomic signing claims, and signer-account sequence ownership.
- Derive protobuf and JSON from the same approved transaction data, or validate their semantic consistency.
- Persist signed transaction identity and reconcile timeouts, restart recovery and on-chain outcomes before retrying.
- Demonstrate concurrent workers, competing scheduled/manual votes, and restart after signing with synthetic fixtures.
- Keep database/authentication choices in the consumer; do not imply the stateless libraries provide these controls.

### R7 — Bound proposal discovery and RPC failure handling

**P2 · Backlog · Planned · Phase: Reliability**

Pagination and repeated-key rejection are already implemented in R1. Remaining acceptance:

- Define bounded request timeouts/cancellation and handling for indefinitely advancing pagination keys.
- Test slow/unavailable endpoints, malformed pages and partial failures without silently returning success.
- Preserve documented callback ordering, retry/deduplication ownership, and broadcast-versus-confirmation semantics.

### R8 — Keep documentation and release evidence current

**P2 · Backlog · Planned · Phase: Maintenance**

Acceptance:

- Typecheck executable README examples and validate local documentation links in an appropriately isolated CI check.
- Keep source behavior, published version, and live operational validation labeled separately.
- Retain weekly Dependabot coverage for the pnpm workspace and SHA-pinned Actions.
- Review relevant alerts, drift and public release notes; do not treat an empty alert list as complete security assurance.

## Documentation map

- [Repository overview and release recovery](../README.md)
- [Reference integration architecture](architecture.md)
- [Core API](../packages/core/README.md)
- [KMS API](../packages/kms/README.md)
- [MOCA adapter API](../packages/adapters/moca/README.md)
- [Poller API](../packages/poller/README.md)

The package guides describe current source behavior. Read the release evidence above before assuming a source feature is available in an installed npm version.
