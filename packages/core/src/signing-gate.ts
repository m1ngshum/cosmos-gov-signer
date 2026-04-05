import type { SigningGateContext } from './types.js'

export interface SigningGateResult {
  readonly approved: boolean
  readonly reason?: string
}

export function evaluateSigningGate(ctx: SigningGateContext): SigningGateResult {
  const { record, now } = ctx

  // Rule 1: threshold met, awaiting sign
  if (record.status === 'ready') {
    return { approved: true }
  }

  // Rule 2: auto-vote window expired, no override submitted
  if (
    record.flow === 'auto_vote' &&
    record.status === 'scheduled' &&
    record.overrideWindowEndsAt !== undefined &&
    now > record.overrideWindowEndsAt
  ) {
    return { approved: true }
  }

  // Rule 3: voting period has passed
  if (record.votingEndTime !== undefined && now > record.votingEndTime) {
    return { approved: false, reason: 'voting_period_expired' }
  }

  // Rule 4: already signed (idempotency guard)
  if (record.txHash !== undefined) {
    return { approved: false, reason: 'already_signed' }
  }

  // Rule 5: default rejection
  return { approved: false, reason: 'not_ready' }
}
