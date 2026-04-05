import { keccak_256 } from '@noble/hashes/sha3.js'
import { bech32 } from 'bech32'

/**
 * Derive a bech32 address from an uncompressed secp256k1/ethsecp256k1 public key.
 *
 * This follows the Ethereum-style address derivation used by Evmos/MOCA:
 *   keccak256(pubkey_64_bytes) → take last 20 bytes → bech32 encode
 *
 * @param publicKey - 64-byte uncompressed public key (x || y, no 0x04 prefix)
 * @param prefix - bech32 prefix (e.g. 'moca')
 * @returns bech32-encoded address (e.g. 'moca1...')
 */
export function deriveAddress(publicKey: Uint8Array, prefix: string): string {
  if (publicKey.length !== 64) {
    throw new Error(`Expected 64-byte public key, got ${publicKey.length} bytes`)
  }

  const hash = keccak_256(publicKey)
  const addressBytes = hash.slice(hash.length - 20)
  const words = bech32.toWords(addressBytes)

  return bech32.encode(prefix, words)
}
