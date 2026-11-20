import { secp256k1 } from '@noble/curves/secp256k1.js'

export function compressEcPubkey(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) throw new Error(`expected 64-byte pubkey, got ${raw.length}`)
  return secp256k1.Point.fromBytes(Buffer.concat([Buffer.from([4]), raw])).toBytes(true)
}
