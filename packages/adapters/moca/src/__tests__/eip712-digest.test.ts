import { describe, it, expect } from 'vitest'

import fixtures from './__fixtures__/eip712-vectors.json'
import { computeMocaEip712Digest } from '../signing/eip712-digest.js'
import type { CosmosMsgJson } from '../signing/eip712-message.js'

interface Fixture {
  chain_id: string
  account_number: number
  sequence: number
  unsigned_tx: {
    body: {
      messages: CosmosMsgJson[]
      memo: string
      timeout_height: string
    }
    auth_info: {
      fee: {
        amount: Array<{ denom: string; amount: string }>
        gas_limit: string
        payer?: string
        granter?: string
      }
    }
  }
  expected_digest_hex: string
}

const all = fixtures as unknown as Record<string, Fixture>

/** Mirror chain's getSigners()[0] semantics: MsgSubmitProposal → proposer,
 *  MsgExec → grantee, MsgVote → voter. */
function signerAddressFor(msg: CosmosMsgJson): string {
  switch (msg['@type']) {
    case '/cosmos.gov.v1.MsgSubmitProposal':
      return String(msg['proposer'])
    case '/cosmos.authz.v1beta1.MsgExec':
      return String(msg['grantee'])
    case '/cosmos.gov.v1.MsgVote':
      return String(msg['voter'])
    default:
      throw new Error(`no signer rule for ${msg['@type']}`)
  }
}

describe('computeMocaEip712Digest', () => {
  for (const [name, fx] of Object.entries(all)) {
    it(`matches Go reference for ${name}`, () => {
      const firstMsg = fx.unsigned_tx.body.messages[0]!
      const digest = computeMocaEip712Digest({
        cosmosChainId: fx.chain_id,
        accountNumber: fx.account_number,
        sequence: fx.sequence,
        bodyMessages: fx.unsigned_tx.body.messages,
        fee: fx.unsigned_tx.auth_info.fee,
        memo: fx.unsigned_tx.body.memo,
        timeoutHeight: fx.unsigned_tx.body.timeout_height,
        signerAddressHex: signerAddressFor(firstMsg),
      })
      expect(digest.toString('hex')).toBe(fx.expected_digest_hex)
    })
  }
})
