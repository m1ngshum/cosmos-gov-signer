# @cosmos-gov-signer/core

Pure types, interfaces, and signing gate logic. Zero runtime dependencies.

## Exports

### Types

- `VoteOption` — `'YES' | 'NO' | 'ABSTAIN' | 'NO_WITH_VETO'`
- `ApprovalStatus` — `'scheduled' | 'pending_approval' | 'ready' | 'signed' | 'cancelled' | 'expired'`
- `FlowType` — `'auto_vote' | 'manual_vote' | 'proposal_submission'`
- `KmsKeyAlias` — `'gov-vote-key' | 'gov-proposal-key'`
- `ApprovalRecord` — Full approval lifecycle record
- `ProposalContent` — On-chain proposal content (title, summary, type)
- `GovernanceProposal` — Normalised on-chain proposal shape
- `SigningGateContext` — Input to the signing gate evaluator

### Interfaces

- `ChainAdapter` — Every chain implementation must satisfy this interface

### Functions

- `evaluateSigningGate(ctx)` — Pure function that determines whether a signing operation should proceed

## Usage

```typescript
import { evaluateSigningGate } from '@cosmos-gov-signer/core'
import type { SigningGateContext } from '@cosmos-gov-signer/core'

const ctx: SigningGateContext = {
  record: approvalRecord,
  now: new Date(),
}

const result = evaluateSigningGate(ctx)
if (result.approved) {
  // proceed with KMS signing
}
```
