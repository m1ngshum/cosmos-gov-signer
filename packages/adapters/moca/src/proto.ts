import type { VoteOption } from '@cosmos-gov-signer/core'
import { VoteOption as ProtoVoteOption } from 'cosmjs-types/cosmos/gov/v1/gov'

/** Map our string vote options to protobuf numeric values */
const VOTE_OPTION_MAP: Record<VoteOption, ProtoVoteOption> = {
  YES: ProtoVoteOption.VOTE_OPTION_YES,
  NO: ProtoVoteOption.VOTE_OPTION_NO,
  ABSTAIN: ProtoVoteOption.VOTE_OPTION_ABSTAIN,
  NO_WITH_VETO: ProtoVoteOption.VOTE_OPTION_NO_WITH_VETO,
} as const

export function toProtoVoteOption(option: VoteOption): ProtoVoteOption {
  return VOTE_OPTION_MAP[option]
}

export const TYPE_URLS = {
  msgVote: '/cosmos.gov.v1.MsgVote',
  msgSubmitProposal: '/cosmos.gov.v1.MsgSubmitProposal',
  msgExec: '/cosmos.authz.v1beta1.MsgExec',
} as const
