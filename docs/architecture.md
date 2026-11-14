# Reference architecture: Cosmos governance signing

This is a proposed consuming-application design around the four libraries. It is not evidence of a deployed approval service, configured AWS policies, working authz grants, or successful live transactions. See the [roadmap](roadmap.md) for implemented work and acceptance gates.

## Library boundary

The current MOCA adapter has fixed identifiers `moca_222888-1`, `moca`, and `ethsecp256k1`. Those constants do not verify the identity of the supplied endpoints. Check the actual target network before signing.

| Provided by this repository | Owned by the consuming application |
| --- | --- |
| Record types and a pure eligibility gate | Approver authentication, threshold checks, override policy, and durable records |
| KMS signing/public-key conversion | Key creation, credentials, key/IAM policies, rotation, and audit logging |
| MOCA message/digest/transaction construction | Matching approved data to protobuf and JSON, network identity, account sequence and fees |
| Single-pass proposal polling and adapter pagination | Scheduling, durable deduplication, bounded retries and monitoring |
| `broadcast_tx_sync` submission returning a hash | Inclusion, execution result, recorded vote, and uncertain-outcome reconciliation |

The design provides off-chain approvals around a single signing key. It does not make that key enforce K-of-N approvals cryptographically.

## Proposed wallet separation

```text
Cold authority account
  └── scoped, expiring authz grant ──► Vote delegate (KMS)

Separate proposal account (KMS)
  └── signs proposal submissions directly
```

- **Authority account:** holds the relevant governance authority and issues or revokes delegation. Keep its signing material offline according to the operator's procedures. Compromise can affect all authority and funds controlled by it.
- **Vote delegate:** should have only the intended voting grant and a bounded fee balance. A voting-only grant does not prevent the delegate's own key from spending its own funds. Risk depends on the actual grants, balances, and credential permissions.
- **Proposal account:** should hold only the funds needed for its approved operational budget. Its key can spend the account's available funds; a deposit-sized balance is a policy, not a library guarantee.

Vote transactions still require fees. Current `signTx` does not expose alternate fee-payer/feegrant parameters. Do not assume a zero-balance delegate works. Establish and validate a funding arrangement before authorizing transactions; feegrant support would need separate implementation and testing.

## Example application flows

These flows are policy examples. There is no scheduler, dashboard, approval database, automatic NO vote, or automatic key selection in the packages.

### Scheduled vote

1. Poll proposals and atomically deduplicate by chain and proposal ID.
2. Create a `scheduled` auto-vote record with a validated voting deadline and an application-defined override window. A six-hour margin is an example, not a built-in default.
3. Apply the application's override policy before the window closes.
4. Once eligible, claim signing work atomically and sign only the approved transaction.
5. Persist the signed transaction's identity and reconcile broadcast, inclusion, execution, and recorded vote before declaring success.

### Manual vote or override

1. Authenticate the request and validate the proposal, option, and voting window.
2. Validate distinct authorized approvers against the configured threshold before marking a record `ready`.
3. Atomically cancel/supersede any competing scheduled vote as part of claiming the manual vote.
4. Run the signing and reconciliation flow with the intended vote key.

### Proposal submission

1. Validate proposal content and approvers before marking a record `ready`.
2. Select the intended proposal key and validate account funds, fees, and deposit requirements.
3. Build matching protobuf and JSON descriptions; the current text-proposal builder supplies metadata but no executable messages.
4. Sign, submit, and reconcile the resulting proposal. Direct proposal submission does not use the vote delegate's `MsgExec` wrapper.

## Gate and concurrency contract

Applications must invoke the gate before any signing request. On current `main`, it rejects invalid dates, an expired supplied voting deadline, and an existing transaction hash before considering either approval path. It approves `ready`, or an eligible `scheduled` auto-vote whose override window has passed. Other states, including `signing`, are rejected.

The gate does not validate approval counts, enforce key choice, update state, or prevent two workers from reading the same eligible record. Use a durable compare-and-set/transaction to claim exactly the expected record version and preserve the gate-approved data. Passing a claimed record back with status `signing` will be rejected: eligibility evaluation and the atomic claim must be coordinated by the application, not treated as two interchangeable API calls.

Track sequence ownership per signer account. On a timeout or restart, reconcile the previously signed transaction before signing again. A hash returned by synchronous broadcast is not execution confirmation. The exact persistence and recovery contract must be implemented and tested in the consumer.

## Authz grant lifecycle

Grant setup is an operational step requiring separate authorization. Validate the target chain ID, account addresses, message scope, grantee, expiry, and on-chain grant state. The library does not create, renew, or revoke grants.

Use the authority account's account address, not its `valoper` address, as granter. Verify CLI syntax and the intended chain before preparing any command. No grant command is part of repository setup or CI.

Monitor expiry, arrange authorized renewal, and document revocation and delegate-key rotation. Expiring grants are not a permanent one-time setup. Broad or additional grants increase the delegate's authority and must be reviewed independently.

## Required operational controls, not deployed guarantees

A consuming service should enforce:

- Distinct approvers, authenticated access, and appropriate MFA/SSO policy.
- Least-privilege key and IAM policies for each signing role; no assumed cross-key isolation.
- Durable approval/signing audit records and configured, verified AWS audit logging.
- Explicit fee/deposit budgets, grant expiry/revocation, and key rotation procedures.
- An approved policy for credentials and browser/session token storage if a dashboard is built.

No API, dashboard, infrastructure policy, or CloudTrail configuration is deployed by these libraries. Validate these controls in the actual consuming environment.

## Validation still needed

Chain-generated fixtures must settle edge-case JSON encoding compatibility and protobuf/JSON consistency. A separately authorized KMS/testnet exercise must establish signature acceptance, transaction inclusion and execution, and the recorded governance outcome. Offline and mocked tests do not establish those results.
