import { describe, it, expect } from 'vitest'
import { toBech32 } from '@cosmjs/encoding'
import { deriveAddress } from '../address.js'

function fromHex(hexStr: string): Uint8Array {
  const bytes = new Uint8Array(hexStr.length / 2)
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
  }
  return bytes
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
  it('derives correct bech32 address from known ETH test vector', () => {
    const address = deriveAddress(TEST_PUBKEY, 'moca')

    // Known ETH address for privkey 0x1: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
    const expected = toBech32('moca', fromHex('7e5f4552091a69125d5dfcb7b8c2659029395bdf'))
    expect(address).toBe(expected)
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
