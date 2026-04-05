import { describe, it, expect, vi } from 'vitest'
import type { ChainAdapter, GovernanceProposal } from '@cosmos-gov-signer/core'
import { pollProposals } from '../poll.js'

function makeProposal(overrides: Partial<GovernanceProposal> = {}): GovernanceProposal {
  return {
    id: 1,
    title: 'Test Proposal',
    summary: 'A test proposal',
    status: 'VOTING_PERIOD',
    votingStartTime: new Date('2026-01-01T00:00:00Z'),
    votingEndTime: new Date('2026-01-15T00:00:00Z'),
    ...overrides,
  }
}

function makeAdapter(proposals: GovernanceProposal[]): ChainAdapter {
  return {
    chainId: 'moca_222888-1',
    addressPrefix: 'moca',
    keyAlgorithm: 'ethsecp256k1',
    rpcEndpoint: 'http://localhost:26657',
    lcdEndpoint: 'http://localhost:1317',
    fetchActiveProposals: vi.fn().mockResolvedValue(proposals),
    buildVoteTx: vi.fn(),
    buildSubmitProposalTx: vi.fn(),
    broadcastTx: vi.fn(),
    deriveAddress: vi.fn(),
  }
}

describe('pollProposals', () => {
  it('calls onNewProposal for each VOTING_PERIOD proposal', async () => {
    const proposals = [
      makeProposal({ id: 1 }),
      makeProposal({ id: 2 }),
    ]
    const adapter = makeAdapter(proposals)
    const callback = vi.fn().mockResolvedValue(undefined)

    await pollProposals(adapter, callback)

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledWith(proposals[0])
    expect(callback).toHaveBeenCalledWith(proposals[1])
  })

  it('skips proposals not in VOTING_PERIOD', async () => {
    const proposals = [
      makeProposal({ id: 1, status: 'VOTING_PERIOD' }),
      makeProposal({ id: 2, status: 'DEPOSIT_PERIOD' }),
      makeProposal({ id: 3, status: 'PASSED' }),
    ]
    const adapter = makeAdapter(proposals)
    const callback = vi.fn().mockResolvedValue(undefined)

    await pollProposals(adapter, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(proposals[0])
  })

  it('handles empty proposal list', async () => {
    const adapter = makeAdapter([])
    const callback = vi.fn().mockResolvedValue(undefined)

    await pollProposals(adapter, callback)

    expect(callback).not.toHaveBeenCalled()
  })

  it('propagates adapter errors', async () => {
    const adapter = makeAdapter([])
    vi.mocked(adapter.fetchActiveProposals).mockRejectedValueOnce(
      new Error('RPC unavailable'),
    )
    const callback = vi.fn()

    await expect(pollProposals(adapter, callback)).rejects.toThrow('RPC unavailable')
  })

  it('propagates callback errors', async () => {
    const adapter = makeAdapter([makeProposal()])
    const callback = vi.fn().mockRejectedValueOnce(new Error('DB write failed'))

    await expect(pollProposals(adapter, callback)).rejects.toThrow('DB write failed')
  })
})
