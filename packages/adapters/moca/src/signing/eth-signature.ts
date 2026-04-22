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
 *
 * Uses noble-curves v2 API: `secp256k1.Point.Fn.ORDER` for curve order,
 * `secp256k1.recoverPublicKey(sig65, msg, { format: 'recovered' })` for recovery.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js'

// noble-curves v2 exposes the scalar field order (curve N) under Point.Fn.ORDER.
const CURVE_N: bigint = (secp256k1 as unknown as {
  Point: { Fn: { ORDER: bigint } }
}).Point.Fn.ORDER

const HALF_N = CURVE_N >> 1n

function bytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n
  for (const b of bytes) v = (v << 8n) | BigInt(b)
  return v
}

function bigIntToBytes(v: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = v
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(x & 0xffn)
    x >>= 8n
  }
  return out
}

function normalizeLowS(rs: Uint8Array): { rs: Uint8Array; flipped: boolean } {
  if (rs.length !== 64) throw new Error(`expected 64-byte R||S, got ${rs.length}`)
  const s = bytesToBigInt(rs.slice(32, 64))
  if (s <= HALF_N) return { rs, flipped: false }
  const flippedS = CURVE_N - s
  const out = new Uint8Array(64)
  out.set(rs.slice(0, 32), 0)
  out.set(bigIntToBytes(flippedS, 32), 32)
  return { rs: out, flipped: true }
}

function compress(rawXY64: Uint8Array): Uint8Array {
  if (rawXY64.length !== 64) throw new Error(`expected 64-byte pubkey, got ${rawXY64.length}`)
  const yLast = rawXY64[63]
  if (yLast === undefined) throw new Error('pubkey truncated')
  const prefix = (yLast & 1) === 0 ? 0x02 : 0x03
  const out = new Uint8Array(33)
  out[0] = prefix
  out.set(rawXY64.slice(0, 32), 1)
  return out
}

interface V2Signature {
  addRecoveryBit(rec: number): V2Signature
  recoverPublicKey(msg: Uint8Array): { toBytes(compressed: boolean): Uint8Array }
}
const SignatureClass = (secp256k1 as unknown as {
  Signature: { fromBytes(bytes: Uint8Array, format: 'compact'): V2Signature }
}).Signature

export function buildEthermintSignature(
  rsFromKms: Uint8Array,
  msgHash: Uint8Array,
  signerPubkey64: Uint8Array,
): Uint8Array {
  if (msgHash.length !== 32) throw new Error('msgHash must be 32 bytes')
  const { rs: normalized } = normalizeLowS(rsFromKms)
  const expectedCompressed = compress(signerPubkey64)

  const base = SignatureClass.fromBytes(normalized, 'compact')
  let matchRec: number | undefined
  for (const rec of [0, 1]) {
    try {
      const recovered = base.addRecoveryBit(rec).recoverPublicKey(msgHash).toBytes(true)
      if (Buffer.from(recovered).equals(Buffer.from(expectedCompressed))) {
        matchRec = rec
        break
      }
    } catch {
      // skip
    }
  }
  if (matchRec === undefined) {
    throw new Error('Could not determine recovery bit; signature/pubkey/msg mismatch')
  }
  const out = new Uint8Array(65)
  out.set(normalized, 0)
  out[64] = matchRec
  return out
}
