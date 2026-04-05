import type { GovernanceProposal, ProposalContent, VoteOption } from './types.js'

/** Chain adapter interface — every chain implementation must satisfy this */
export interface ChainAdapter {
  readonly chainId: string
  readonly addressPrefix: string
  readonly keyAlgorithm: 'ethsecp256k1' | 'secp256k1'
  readonly rpcEndpoint: string
  readonly lcdEndpoint: string

  fetchActiveProposals(): Promise<readonly GovernanceProposal[]>
  buildVoteTx(proposalId: number, option: VoteOption, voter: string, granter: string): Promise<Uint8Array>
  buildSubmitProposalTx(content: ProposalContent, depositAmount: string, proposer: string): Promise<Uint8Array>
  broadcastTx(signedTxBytes: Uint8Array): Promise<string>
  deriveAddress(publicKey: Buffer): string
}
