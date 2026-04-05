import type { ChainAdapter, GovernanceProposal } from '@cosmos-gov-signer/core'

/**
 * Fetch active governance proposals and invoke a callback for each one
 * currently in voting period.
 *
 * This function is stateless — the caller is responsible for deduplication
 * (e.g. checking if an ApprovalRecord already exists for a given proposalId).
 *
 * Designed to be invoked by a scheduler (e.g. EventBridge every 5 minutes).
 *
 * @param adapter - Chain adapter to fetch proposals from
 * @param onNewProposal - Callback invoked for each active proposal
 */
export async function pollProposals(
  adapter: ChainAdapter,
  onNewProposal: (proposal: GovernanceProposal) => Promise<void>,
): Promise<void> {
  const proposals = await adapter.fetchActiveProposals()

  for (const proposal of proposals) {
    if (proposal.status === 'VOTING_PERIOD') {
      await onNewProposal(proposal)
    }
  }
}
