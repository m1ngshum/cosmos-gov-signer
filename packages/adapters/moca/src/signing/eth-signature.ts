/**
 * Convert a 64-byte compact ECDSA signature (R || S) from AWS KMS into the
 * 65-byte Ethereum-style `[R || S || V]` form that Ethermint/MOCA's
 * `ethsecp256k1` verifier expects.
 *
 * Two fix-ups vs standard Cosmos `secp256k1` signatures:
 * 1. Low-S normalization (Ethereum rejects high-S per EIP-2 malleability rule).
 *    If S > N/2, replace with N - S and flip the recovery bit.
 * 2. Recovery-bit derivation: try rec=0 and rec=1, recover a pubkey for each,
 *    match against the KMS pubkey we already have.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { compressEcPubkey } from '../public-key.js'

export function buildEthermintSignature(
  rsFromKms: Uint8Array,
  msgHash: Uint8Array,
  signerPubkey64: Uint8Array,
): Uint8Array {
  if (msgHash.length !== 32) throw new Error('msgHash must be 32 bytes')
  const sig = secp256k1.Signature.fromBytes(rsFromKms, 'compact')
  const base = sig.hasHighS() ? new secp256k1.Signature(sig.r, secp256k1.Point.Fn.ORDER - sig.s) : sig
  const expectedCompressed = compressEcPubkey(signerPubkey64)
  let matchRec: number | undefined
  for (const rec of [0, 1]) {
    try {
      const recovered = base.addRecoveryBit(rec).recoverPublicKey(msgHash).toBytes(true)
      if (Buffer.from(recovered).equals(Buffer.from(expectedCompressed))) {
        matchRec = rec
        break
      }
    } catch (err) {
      // Known: noble throws when the recovery point is not on the curve for
      // this (sig, rec) combination. Any other error means the underlying
      // crypto primitive is broken — surface it loudly.
      if (!(err instanceof Error) || !/recover|point/i.test(err.message)) {
        throw err
      }
    }
  }
  if (matchRec === undefined) {
    throw new Error('Could not determine recovery bit; signature/pubkey/msg mismatch')
  }
  const out = new Uint8Array(65)
  out.set(base.toBytes('compact'), 0)
  out[64] = matchRec
  return out
}
