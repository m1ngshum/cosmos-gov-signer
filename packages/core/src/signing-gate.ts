import type { SigningGateContext } from './types.js'

export interface SigningGateResult {
  readonly approved: boolean
  readonly reason?: string
}

export function evaluateSigningGate(ctx: SigningGateContext): SigningGateResult {
  const { record, now } = ctx

  if (record.status === 'ready') {
    if (record.txHash !== undefined) {
      return { approved: false, reason: 'already_signed' }
    }
    return { approved: true }
  }

  if (
    record.flow === 'auto_vote' &&
    record.status === 'scheduled' &&
    record.overrideWindowEndsAt !== undefined &&
    now > record.overrideWindowEndsAt
  ) {
    return { approved: true }
  }

  if (record.votingEndTime !== undefined && now > record.votingEndTime) {
    return { approved: false, reason: 'voting_period_expired' }
  }

  if (record.txHash !== undefined) {
    return { approved: false, reason: 'already_signed' }
  }

  return { approved: false, reason: 'not_ready' }
}
