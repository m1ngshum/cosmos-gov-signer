import { describe, it, expect } from 'vitest'
import { evaluateSigningGate } from '../signing-gate.js'
import type { ApprovalRecord, SigningGateContext } from '../types.js'

function makeRecord(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: 'test-id',
    flow: 'auto_vote',
    proposalId: 1,
    voteOption: 'NO',
    requiredApprovals: 2,
    approvals: [],
    status: 'scheduled',
    kmsKeyUsed: 'gov-vote-key',
    createdBy: 'automation',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeCtx(
  recordOverrides: Partial<ApprovalRecord> = {},
  now = new Date('2026-01-15T12:00:00Z'),
): SigningGateContext {
  return { record: makeRecord(recordOverrides), now }
}

describe('evaluateSigningGate', () => {
  describe('Rule 1: status === ready', () => {
    it('approves when status is ready', () => {
      const result = evaluateSigningGate(makeCtx({ status: 'ready' }))
      expect(result).toEqual({ approved: true })
    })

    it('approves ready even if voting period has expired', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'ready',
        votingEndTime: new Date('2026-01-10T00:00:00Z'),
      }))
      expect(result).toEqual({ approved: true })
    })

    it('approves ready even if txHash exists', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'ready',
        txHash: '0xabc',
      }))
      expect(result).toEqual({ approved: true })
    })
  })

  describe('Rule 2: auto_vote + window expired + scheduled', () => {
    it('approves when override window has expired', () => {
      const result = evaluateSigningGate(makeCtx({
        flow: 'auto_vote',
        status: 'scheduled',
        overrideWindowEndsAt: new Date('2026-01-15T10:00:00Z'),
      }))
      expect(result).toEqual({ approved: true })
    })

    it('does not approve if override window has not expired', () => {
      const result = evaluateSigningGate(makeCtx({
        flow: 'auto_vote',
        status: 'scheduled',
        overrideWindowEndsAt: new Date('2026-01-15T14:00:00Z'),
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })

    it('does not approve if flow is not auto_vote', () => {
      const result = evaluateSigningGate(makeCtx({
        flow: 'manual_vote',
        status: 'scheduled',
        overrideWindowEndsAt: new Date('2026-01-15T10:00:00Z'),
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })

    it('does not approve if status is not scheduled', () => {
      const result = evaluateSigningGate(makeCtx({
        flow: 'auto_vote',
        status: 'pending_approval',
        overrideWindowEndsAt: new Date('2026-01-15T10:00:00Z'),
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })

    it('does not approve if overrideWindowEndsAt is undefined', () => {
      const result = evaluateSigningGate(makeCtx({
        flow: 'auto_vote',
        status: 'scheduled',
        overrideWindowEndsAt: undefined,
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })
  })

  describe('Rule 3: voting period expired', () => {
    it('rejects when voting end time has passed', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'pending_approval',
        votingEndTime: new Date('2026-01-10T00:00:00Z'),
      }))
      expect(result).toEqual({ approved: false, reason: 'voting_period_expired' })
    })

    it('does not reject when voting end time is in the future', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'pending_approval',
        votingEndTime: new Date('2026-01-20T00:00:00Z'),
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })
  })

  describe('Rule 4: already signed', () => {
    it('rejects when txHash already exists', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'signed',
        txHash: '0xabc123',
      }))
      expect(result).toEqual({ approved: false, reason: 'already_signed' })
    })
  })

  describe('Rule 5: default rejection', () => {
    it('rejects with not_ready by default', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'pending_approval',
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })

    it('rejects cancelled records', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'cancelled',
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })

    it('rejects expired records', () => {
      const result = evaluateSigningGate(makeCtx({
        status: 'expired',
      }))
      expect(result).toEqual({ approved: false, reason: 'not_ready' })
    })
  })
})
