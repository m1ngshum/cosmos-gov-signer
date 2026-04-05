import { describe, it, expect } from 'vitest'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bech32 } from 'bech32'
import { deriveAddress } from '../address.js'

function fromHex(hexStr: string): Uint8Array {
  const bytes = new Uint8Array(hexStr.length / 2)
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
  }
  return bytes
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Well-known Ethereum test vector:
// Private key: 0x1 (smallest valid key)
// Uncompressed pubkey (without 04 prefix):
//   x = 79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
//   y = 483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
// ETH address: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
const TEST_PUBKEY = fromHex(
  '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
  '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
)

describe('deriveAddress', () => {
  it('derives correct bech32 address from known pubkey', () => {
    const address = deriveAddress(TEST_PUBKEY, 'moca')

    // Verify via independent computation
    const hash = keccak_256(TEST_PUBKEY)
    const last20 = hash.slice(hash.length - 20)
    const expected = bech32.encode('moca', bech32.toWords(last20))

    expect(address).toBe(expected)
    expect(address.startsWith('moca1')).toBe(true)
  })

  it('produces the same last-20-bytes as the known ETH address', () => {
    const hash = keccak_256(TEST_PUBKEY)
    const last20 = hex(hash.slice(hash.length - 20))

    // ETH address 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf (lowercase)
    expect(last20).toBe('7e5f4552091a69125d5dfcb7b8c2659029395bdf')
  })

  it('uses the correct prefix', () => {
    const address = deriveAddress(TEST_PUBKEY, 'evmos')
    expect(address.startsWith('evmos1')).toBe(true)
  })

  it('throws for wrong-length public key', () => {
    expect(() => deriveAddress(new Uint8Array(32), 'moca')).toThrow(
      'Expected 64-byte public key',
    )
    expect(() => deriveAddress(new Uint8Array(65), 'moca')).toThrow(
      'Expected 64-byte public key',
    )
  })
})
