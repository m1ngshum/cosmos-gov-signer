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
import {
  assembleTxRaw,
  buildEthermintSignature,
  buildTxParts,
  computeMocaEip712Digest,
  type CosmosMsgJson,
} from './signing/index.js'

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

const MOCA_REGISTRY = new Registry([
  [TYPE_URLS.msgVote, MsgVote],
  [TYPE_URLS.msgExec, MsgExec],
  [TYPE_URLS.msgSubmitProposal, MsgSubmitProposal],
])

export class MocaChainAdapter implements ChainAdapter {
  readonly chainId = 'moca_222888-1'
  readonly addressPrefix = 'moca'
  readonly keyAlgorithm = 'ethsecp256k1' as const
  readonly rpcEndpoint: string
  readonly lcdEndpoint: string

  private readonly registry = MOCA_REGISTRY

  constructor(config: MocaAdapterConfig) {
    this.rpcEndpoint = config.rpcEndpoint
    this.lcdEndpoint = config.lcdEndpoint
  }

  async fetchActiveProposals(): Promise<readonly GovernanceProposal[]> {
    const url = `${this.lcdEndpoint}/cosmos/gov/v1/proposals?proposal_status=PROPOSAL_STATUS_VOTING_PERIOD`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`LCD query failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as LcdProposalsResponse
    if (!Array.isArray(data?.proposals)) {
      throw new Error('LCD response missing proposals array')
    }

    return data.proposals.map((p): GovernanceProposal => {
      const id = Number(p.id)
      if (!Number.isSafeInteger(id)) {
        throw new Error(`Proposal ID ${p.id} exceeds safe integer range`)
      }

      const votingStartTime = new Date(p.voting_start_time)
      const votingEndTime = new Date(p.voting_end_time)
      if (isNaN(votingStartTime.getTime()) || isNaN(votingEndTime.getTime())) {
        throw new Error(`Proposal ${p.id} has invalid voting time`)
      }

      return {
        id,
        title: p.title ?? '',
        summary: p.summary ?? '',
        status: mapLcdStatus(p.status),
        votingStartTime,
        votingEndTime,
      }
    })
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
    const response = await fetch(this.rpcEndpoint, {
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

  /** Sign a cosmos-sdk tx using MOCA's forced EIP-712 path.
   *
   *  The chain verifies signatures against an EIP-712 typed-data digest
   *  regardless of the declared SignMode (see moca-cosmos-sdk's
   *  GetSignBytesAdapter at x/auth/signing/adapter.go:56-100). This method
   *  builds the exact typed-data the chain reconstructs, delegates the
   *  hash to an external signer (typically AWS KMS), appends the recovery
   *  byte, and assembles a broadcast-ready TxRaw.
   *
   *  `signDigest` receives the 32-byte keccak digest and must return a
   *  64-byte compact ECDSA (R || S) signature. KMS callers can wrap
   *  `signWithKMS` from @cosmos-gov-signer/kms. */
  async signTx(input: {
    /** Inner cosmos message, already proto-encoded via buildVoteTx /
     *  buildSubmitProposalTx. Written verbatim into the TxBody. */
    readonly innerMsg: { typeUrl: string; value: Uint8Array }
    /** JSON representation of the body messages used by the EIP-712 type
     *  builder. Must describe the same semantic tx as `innerMsg`. */
    readonly bodyMessages: CosmosMsgJson[]
    /** 64-byte raw (X || Y) secp256k1 pubkey of the signer. */
    readonly signerPubkey: Uint8Array
    /** 0x-hex (20-byte) address of the signer — also used as the fee-payer
     *  fallback per MOCA's FeePayer() semantics. */
    readonly signerAddressHex: string
    readonly accountNumber: bigint
    readonly sequence: bigint
    readonly chainId: string
    readonly fee: {
      readonly denom: string
      readonly amount: string
      readonly gasLimit: bigint
    }
    readonly memo?: string
    /** External 64-byte (R||S) signer over a 32-byte keccak digest. */
    readonly signDigest: (digest: Uint8Array) => Promise<Uint8Array>
  }): Promise<Uint8Array> {
    const parts = buildTxParts({
      innerMsg: input.innerMsg,
      signerPubkey: input.signerPubkey,
      sequence: input.sequence,
      accountNumber: input.accountNumber,
      chainId: input.chainId,
      fee: {
        amount: [{ denom: input.fee.denom, amount: input.fee.amount }],
        gasLimit: input.fee.gasLimit,
      },
      memo: input.memo,
    })

    const digest = computeMocaEip712Digest({
      cosmosChainId: input.chainId,
      accountNumber: input.accountNumber,
      sequence: input.sequence,
      bodyMessages: input.bodyMessages,
      fee: {
        amount: [{ denom: input.fee.denom, amount: input.fee.amount }],
        gas_limit: String(input.fee.gasLimit),
        payer: '',
        granter: '',
      },
      memo: input.memo ?? '',
      timeoutHeight: '0',
      signerAddressHex: input.signerAddressHex,
    })

    const rsSignature = await input.signDigest(digest)
    const signature = buildEthermintSignature(rsSignature, digest, input.signerPubkey)
    return assembleTxRaw({
      bodyBytes: parts.bodyBytes,
      authInfoBytes: parts.authInfoBytes,
      signature,
    })
  }
}
