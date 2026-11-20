import { describe, expect, it } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { buildEthermintSignature } from '../signing/eth-signature.js'

describe('buildEthermintSignature', () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
  const digest = new Uint8Array(32).fill(19)
  const pubkey = secp256k1.getPublicKey(key, false).slice(1)
  const compact = secp256k1.sign(digest, key, { prehash: false })
  const low = secp256k1.Signature.fromBytes(compact, 'compact')
  const high = new secp256k1.Signature(low.r, secp256k1.Point.Fn.ORDER - low.s)

  it('returns the same recoverable low-S signature for either valid S', () => {
    const sig = buildEthermintSignature(high.toBytes('compact'), digest, pubkey)
    expect(sig).toEqual(buildEthermintSignature(compact, digest, pubkey))
    expect(sig.slice(0, 64)).toEqual(compact)
    expect(low.addRecoveryBit(sig[64]!).recoverPublicKey(digest).toBytes(false).slice(1)).toEqual(pubkey)
  })

  it('rejects an invalid Y coordinate with the correct parity', () => {
    const invalid = pubkey.slice()
    invalid[32] = invalid[32]! ^ 1
    expect(() => buildEthermintSignature(compact, digest, invalid)).toThrow()
  })
})
