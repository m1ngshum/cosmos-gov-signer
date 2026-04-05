import type {
  ChainAdapter,
  GovernanceProposal,
  ProposalContent,
  VoteOption,
} from '@cosmos-gov-signer/core'
import { Registry } from '@cosmjs/proto-signing'
import { MsgVote, MsgSubmitProposal } from 'cosmjs-types/cosmos/gov/v1/tx'
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx'
import { toProtoVoteOption, TYPE_URLS } from './proto.js'
import { deriveAddress } from './address.js'

export interface MocaAdapterConfig {
  readonly rpcEndpoint: string
  readonly lcdEndpoint: string
}

interface LcdProposal {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly status: string
  readonly voting_start_time: string
  readonly voting_end_time: string
}

interface LcdProposalsResponse {
  readonly proposals: readonly LcdProposal[]
}

const LCD_STATUS_MAP: Record<string, GovernanceProposal['status'] | undefined> = {
  PROPOSAL_STATUS_DEPOSIT_PERIOD: 'DEPOSIT_PERIOD',
  PROPOSAL_STATUS_VOTING_PERIOD: 'VOTING_PERIOD',
  PROPOSAL_STATUS_PASSED: 'PASSED',
  PROPOSAL_STATUS_REJECTED: 'REJECTED',
  PROPOSAL_STATUS_FAILED: 'FAILED',
}

function mapLcdStatus(raw: string): GovernanceProposal['status'] {
  const mapped = LCD_STATUS_MAP[raw]
  if (mapped === undefined) {
    throw new Error(`Unknown proposal status: ${raw}`)
  }
  return mapped
}

export class MocaChainAdapter implements ChainAdapter {
  readonly chainId = 'moca_222888-1'
  readonly addressPrefix = 'moca'
  readonly keyAlgorithm = 'ethsecp256k1' as const
  readonly rpcEndpoint: string
  readonly lcdEndpoint: string

  private readonly registry: Registry

  constructor(config: MocaAdapterConfig) {
    this.rpcEndpoint = config.rpcEndpoint
    this.lcdEndpoint = config.lcdEndpoint

    this.registry = new Registry()
    this.registry.register(TYPE_URLS.msgVote, MsgVote)
    this.registry.register(TYPE_URLS.msgExec, MsgExec)
    this.registry.register(TYPE_URLS.msgSubmitProposal, MsgSubmitProposal)
  }

  async fetchActiveProposals(): Promise<readonly GovernanceProposal[]> {
    const url = `${this.lcdEndpoint}/cosmos/gov/v1/proposals?proposal_status=PROPOSAL_STATUS_VOTING_PERIOD`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`LCD query failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as LcdProposalsResponse

    return data.proposals.map((p): GovernanceProposal => ({
      id: Number(p.id),
      title: p.title,
      summary: p.summary,
      status: mapLcdStatus(p.status),
      votingStartTime: new Date(p.voting_start_time),
      votingEndTime: new Date(p.voting_end_time),
    }))
  }

  async buildVoteTx(
    proposalId: number,
    option: VoteOption,
    voter: string,
    granter: string,
  ): Promise<Uint8Array> {
    const innerMsg = MsgVote.encode(
      MsgVote.fromPartial({
        proposalId: BigInt(proposalId),
        voter: granter,
        option: toProtoVoteOption(option),
      }),
    ).finish()

    const execMsg = MsgExec.encode(
      MsgExec.fromPartial({
        grantee: voter,
        msgs: [
          {
            typeUrl: TYPE_URLS.msgVote,
            value: innerMsg,
          },
        ],
      }),
    ).finish()

    return execMsg
  }

  async buildSubmitProposalTx(
    content: ProposalContent,
    depositAmount: string,
    proposer: string,
  ): Promise<Uint8Array> {
    const msg = MsgSubmitProposal.encode(
      MsgSubmitProposal.fromPartial({
        title: content.title,
        summary: content.summary,
        metadata: content.metadata ?? '',
        proposer,
        initialDeposit: [
          {
            denom: 'amoca',
            amount: depositAmount,
          },
        ],
      }),
    ).finish()

    return msg
  }

  async broadcastTx(signedTxBytes: Uint8Array): Promise<string> {
    const url = `${this.rpcEndpoint}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'broadcast_tx_sync',
        params: {
          tx: Buffer.from(signedTxBytes).toString('base64'),
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Broadcast failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      result?: { hash?: string; code?: number; log?: string }
      error?: { message?: string }
    }

    if (data.error !== undefined) {
      throw new Error(`Broadcast RPC error: ${data.error.message ?? 'unknown'}`)
    }

    if (data.result?.code !== undefined && data.result.code !== 0) {
      throw new Error(`Broadcast tx error (code ${data.result.code}): ${data.result.log ?? ''}`)
    }

    const txHash = data.result?.hash
    if (txHash === undefined) {
      throw new Error('Broadcast response missing tx hash')
    }

    return txHash
  }

  deriveAddress(publicKey: Buffer): string {
    return deriveAddress(new Uint8Array(publicKey), this.addressPrefix)
  }
}
