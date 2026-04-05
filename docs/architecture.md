# Architecture: Cosmos Governance Signing

## Problem

MOCA chain (`moca_222888-1`) is an Evmos v12 fork using `ethsecp256k1` for all account keys. The standard Cosmos SDK multisig type (`LegacyAminoPubKey`) only supports `secp256k1`, making native validator multisig unavailable.

## Solution: Three-Wallet Design

Three separate keys with isolated blast radii replace on-chain multisig:

### Validator Operator Key
- **Algorithm:** ethsecp256k1
- **Location:** Cold hardware wallet (never online)
- **Holds:** All staked MOCA and validator voting power
- **Used for:** Issuing authz grant to vote-only wallet (one-time)
- **Compromise blast radius:** All staked MOCA

### Vote-Only Wallet
- **Algorithm:** ethsecp256k1
- **Location:** AWS KMS (`gov-vote-key`)
- **Holds:** Zero MOCA balance
- **Used for:** Signing `MsgVote` via `authz exec` on behalf of operator key
- **Compromise blast radius:** Vote manipulation only, no funds at risk

### Proposal Wallet
- **Algorithm:** ethsecp256k1
- **Location:** AWS KMS (`gov-proposal-key`)
- **Holds:** Minimum deposit amount
- **Used for:** Signing `MsgSubmitProposal` directly
- **Compromise blast radius:** Deposit balance only

## Approval Flows

### Flow A: Auto-NO (default)

Every new proposal entering `VOTING_PERIOD` triggers an automatic NO vote:

1. Poller detects proposal
2. Auto-NO record created (`status: scheduled`)
3. Override window opens (until `voting_end_time - 6h`)
4. No override submitted → window expires
5. Signing gate approves → KMS signs → broadcast via authz exec
6. Record status → `signed`

### Flow B: Manual Vote Override

An approver or proposer requests a different vote option:

1. Same trigger as Flow A
2. Override requested (YES / ABSTAIN / NO_WITH_VETO)
3. K-of-N approvers sign off → `status: ready`
4. Original auto-NO cancelled
5. Override vote signed and broadcast via authz exec

### Flow C: Proposal Submission

A proposer drafts a new governance proposal:

1. Proposer drafts proposal in dashboard
2. Approval record created (`status: pending_approval`)
3. K-of-N approvers sign off → `status: ready`
4. Proposal wallet KMS key signs `MsgSubmitProposal`
5. Broadcast directly (no authz exec needed)

## Signing Gate

All flows converge at the same gate before any `kms:Sign` call:

```
1. Record status is "ready"
   OR (flow == auto_vote AND now > overrideWindowEndsAt AND status == "scheduled")
2. voting_end_time has not passed
3. No existing txHash (idempotency guard)
```

Key selection:
- Flows A + B → `gov-vote-key` (vote-only wallet)
- Flow C → `gov-proposal-key` (proposal wallet)

## Authz Grant Setup

One-time command from the cold operator key:

```bash
mocad tx authz grant <vote_only_wallet_address> generic \
  --msg-type /cosmos.gov.v1.MsgVote \
  --from <operator_address> \
  --expiration "2027-01-01T00:00:00Z" \
  --chain-id moca_222888-1
```

## Security Considerations

- M-of-N threshold is enforced off-chain by the API's approval database
- The approval DB is a high-trust component — compromise enables vote/proposal manipulation
- Two separate IAM policies ensure vote and proposal KMS keys cannot cross-use
- CloudTrail logs every `kms:Sign` call
- JWT auth with SSO + MFA for dashboard access
- JWT stored in memory only (never localStorage/sessionStorage)
