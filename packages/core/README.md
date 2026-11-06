# @m1ngshum/cosmos-gov-signer-core

Types, the `ChainAdapter` interface, and a pure signing eligibility check for Cosmos governance applications. This package has no runtime dependencies.

## Install

```bash
npm install @m1ngshum/cosmos-gov-signer-core
```

The package exposes ES module imports and TypeScript declarations.

## Public API

| Export | Purpose |
| --- | --- |
| `evaluateSigningGate(ctx)` | Return a `SigningGateResult` with `approved` and an optional rejection `reason` |
| `SigningGateContext` | An `ApprovalRecord` and the caller's current `Date` |
| `ApprovalRecord` | Approval, override, signing-status, and transaction-hash data |
| `SigningGateResult` | Result of the eligibility check |
| `ChainAdapter` | Proposal fetching, message building, address derivation, and transaction broadcast contract |
| `GovernanceProposal` | Normalised proposal with voting dates |
| `ProposalContent` | Title, summary, type, and optional metadata URL |
| `VoteOption` | `YES`, `NO`, `ABSTAIN`, or `NO_WITH_VETO` |
| `ApprovalStatus` | `scheduled`, `pending_approval`, `ready`, `signing`, `signed`, `cancelled`, or `expired` |
| `FlowType` | `auto_vote`, `manual_vote`, or `proposal_submission` |
| `KmsKeyAlias` | Logical key names `gov-vote-key` or `gov-proposal-key` |

All exports except `evaluateSigningGate` are TypeScript types.

## Example

```typescript
import {
  evaluateSigningGate,
  type ApprovalRecord,
} from '@m1ngshum/cosmos-gov-signer-core'

const record: ApprovalRecord = {
  id: 'review-42',
  flow: 'manual_vote',
  proposalId: 42,
  voteOption: 'NO',
  requiredApprovals: 2,
  approvals: [],
  status: 'pending_approval',
  kmsKeyUsed: 'gov-vote-key',
  createdBy: 'operator',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  votingEndTime: new Date('2026-01-15T00:00:00Z'),
}

const result = evaluateSigningGate({
  record,
  now: new Date('2026-01-02T00:00:00Z'),
})
console.log(result) // { approved: false, reason: 'not_ready' }
```

## Gate behavior and caller responsibilities

Checks run in this order:

1. If `votingEndTime` exists and `now > votingEndTime`, reject with `voting_period_expired`.
2. If `txHash` is present, reject with `already_signed`.
3. Approve a record whose status is `ready`.
4. Approve an `auto_vote` record still `scheduled` when `overrideWindowEndsAt` exists and `now > overrideWindowEndsAt`.
5. Reject everything else with `not_ready`.

The time comparisons are strict: equality does not count as "passed". An absent voting deadline is not checked.

The gate trusts `ready`; it does not count approvals, validate approver identities, apply an override, or change the record. An eligible scheduled auto-vote does not require the manual approval threshold. The application must implement its chosen approval policy and validate record data before calling the gate.

Call the gate before signing: the KMS and adapter APIs do not enforce it. The result is not a lock or a durable idempotency guarantee. The application must atomically claim the record for signing, coordinate account sequences, and persist/reconcile transaction outcomes. A `signing` record is rejected, but this package does not set that status or prevent concurrent workers from reading the same `ready` record.
