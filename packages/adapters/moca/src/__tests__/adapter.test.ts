import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MsgSubmitProposal } from 'cosmjs-types/cosmos/gov/v1/tx'
import { MocaChainAdapter } from '../adapter.js'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeAdapter(): MocaChainAdapter {
  return new MocaChainAdapter({
    rpcEndpoint: 'http://localhost:26657',
    lcdEndpoint: 'http://localhost:1317',
  })
}

describe('MocaChainAdapter', () => {
  it('has correct chain constants', () => {
    const adapter = makeAdapter()
    expect(adapter.chainId).toBe('moca_222888-1')
    expect(adapter.addressPrefix).toBe('moca')
    expect(adapter.keyAlgorithm).toBe('ethsecp256k1')
  })

  describe('fetchActiveProposals', () => {
    it('fetches and maps proposals from LCD', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          proposals: [
            {
              id: '42',
              title: 'Test Proposal',
              summary: 'A governance proposal',
              status: 'PROPOSAL_STATUS_VOTING_PERIOD',
              voting_start_time: '2026-01-01T00:00:00Z',
              voting_end_time: '2026-01-15T00:00:00Z',
            },
          ],
        }),
      })

      const proposals = await adapter.fetchActiveProposals()

      expect(proposals).toHaveLength(1)
      expect(proposals[0]).toEqual({
        id: 42,
        title: 'Test Proposal',
        summary: 'A governance proposal',
        status: 'VOTING_PERIOD',
        votingStartTime: new Date('2026-01-01T00:00:00Z'),
        votingEndTime: new Date('2026-01-15T00:00:00Z'),
      })
    })

    it('queries the correct LCD endpoint', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ proposals: [] }),
      })

      await adapter.fetchActiveProposals()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:1317/cosmos/gov/v1/proposals?proposal_status=PROPOSAL_STATUS_VOTING_PERIOD',
      )
    })

    it('throws on LCD error', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(adapter.fetchActiveProposals()).rejects.toThrow('LCD query failed: 500')
    })

    it('handles empty proposal list', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ proposals: [] }),
      })

      const proposals = await adapter.fetchActiveProposals()
      expect(proposals).toEqual([])
    })
  })

  describe('buildVoteTx', () => {
    it('returns encoded MsgExec wrapping MsgVote', async () => {
      const adapter = makeAdapter()
      const result = await adapter.buildVoteTx(
        42,
        'NO',
        'moca1grantee',
        'moca1granter',
      )

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('buildSubmitProposalTx', () => {
    it('returns encoded MsgSubmitProposal', async () => {
      const adapter = makeAdapter()
      const result = await adapter.buildSubmitProposalTx(
        { title: 'Test', summary: 'A test', type: 'text' },
        '1000000',
        'moca1proposer',
      )

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('broadcastTx', () => {
    it('returns tx hash on success', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { hash: 'ABCDEF1234567890', code: 0 },
        }),
      })

      const txHash = await adapter.broadcastTx(new Uint8Array([1, 2, 3]))
      expect(txHash).toBe('ABCDEF1234567890')
    })

    it('throws on RPC error response', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { message: 'tx already in mempool' },
        }),
      })

      await expect(
        adapter.broadcastTx(new Uint8Array([1, 2, 3])),
      ).rejects.toThrow('Broadcast RPC error')
    })

    it('throws on non-zero tx code', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { hash: 'ABC', code: 5, log: 'insufficient fee' },
        }),
      })

      await expect(
        adapter.broadcastTx(new Uint8Array([1, 2, 3])),
      ).rejects.toThrow('Broadcast tx error (code 5)')
    })

    it('throws on HTTP error', async () => {
      const adapter = makeAdapter()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
      })

      await expect(
        adapter.broadcastTx(new Uint8Array([1, 2, 3])),
      ).rejects.toThrow('Broadcast failed: 502')
    })
  })

  describe('deriveAddress', () => {
    it('delegates to address derivation with moca prefix', () => {
      const adapter = makeAdapter()
      const pubkey = Buffer.alloc(64, 0x01)
      const address = adapter.deriveAddress(pubkey)
      expect(address.startsWith('moca1')).toBe(true)
    })
  })
})

describe('MocaChainAdapter.buildSubmitProposalTx', () => {
  it('threads metadata URL into encoded proto bytes', async () => {
    const adapter = new MocaChainAdapter({
      rpcEndpoint: 'http://fake',
      lcdEndpoint: 'http://fake',
    })
    const bytes = await adapter.buildSubmitProposalTx(
      { title: 'T', summary: 'S', type: 'text', metadata: 'ipfs://Qm123' },
      '1000000',
      '0x000000000000000000000000000000000000dEaD',
    )
    const decoded = MsgSubmitProposal.decode(bytes)
    expect(decoded.metadata).toBe('ipfs://Qm123')
    expect(decoded.title).toBe('T')
    expect(decoded.summary).toBe('S')
  })
})
