/** Vote options matching Cosmos SDK gov v1 */
export type VoteOption = 'YES' | 'NO' | 'ABSTAIN' | 'NO_WITH_VETO'

/** Status lifecycle for an approval record */
export type ApprovalStatus =
  | 'scheduled'
  | 'pending_approval'
  | 'ready'
  | 'signed'
  | 'cancelled'
  | 'expired'

export type FlowType = 'auto_vote' | 'manual_vote' | 'proposal_submission'

export type KmsKeyAlias = 'gov-vote-key' | 'gov-proposal-key'

export interface ProposalContent {
  readonly title: string
  readonly summary: string
  readonly type: string
  /** Optional off-chain metadata URL (e.g. ipfs://..., https://...). MOCA's
   *  gov module accepts a proposal as valid if either `metadata` is set OR
   *  `messages` contains at least one executable msg. Without one, tx
   *  broadcasts fail with code=11 "either metadata or Msgs length must be
   *  non-nil". See moca-cosmos-sdk/x/gov/types/v1/msgs.go. */
  readonly metadata?: string
}

export interface ApprovalRecord {
  readonly id: string
  readonly flow: FlowType
  readonly proposalId?: number
  readonly voteOption: VoteOption
  readonly proposalContent?: ProposalContent
  readonly depositAmount?: string
  readonly requiredApprovals: number
  readonly approvals: ReadonlyArray<{ readonly user: string; readonly at: Date }>
  readonly override?: {
    readonly requestedBy: string
    readonly newOption: VoteOption
    readonly approvals: ReadonlyArray<{ readonly user: string; readonly at: Date }>
    readonly requestedAt: Date
  }
  readonly overrideWindowEndsAt?: Date
  readonly votingEndTime?: Date
  readonly status: ApprovalStatus
  readonly txHash?: string
  readonly kmsKeyUsed: KmsKeyAlias
  readonly createdBy: string
  readonly createdAt: Date
}

/** On-chain proposal shape (normalised, not chain-specific) */
export interface GovernanceProposal {
  readonly id: number
  readonly title: string
  readonly summary: string
  readonly status: 'DEPOSIT_PERIOD' | 'VOTING_PERIOD' | 'PASSED' | 'REJECTED' | 'FAILED'
  readonly votingStartTime: Date
  readonly votingEndTime: Date
}

/** Signing gate evaluation context */
export interface SigningGateContext {
  readonly record: ApprovalRecord
  readonly now: Date
}
