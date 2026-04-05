import { describe, it, expect } from 'vitest'
import { decodeDerSignature, extractPublicKeyFromSpki } from '../der.js'

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hexStr: string): Uint8Array {
  const bytes = new Uint8Array(hexStr.length / 2)
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
  }
  return bytes
}

// 32-byte test values (64 hex chars each)
const R32 = '0102030405060708091011121314151617181920212223242526272829303132'
const S32 = '3334353637383940414243444546474849505152535455565758596061626364'

// High-bit r value (needs 0x00 pad in DER)
const R32_HIGH = 'f102030405060708091011121314151617181920212223242526272829303132'
const S32_HIGH = 'f334353637383940414243444546474849505152535455565758596061626364'

describe('decodeDerSignature', () => {
  it('decodes a standard DER signature with 32-byte r and s', () => {
    const der = fromHex(
      '3044' +         // SEQUENCE, 68 bytes
      '0220' + R32 +   // INTEGER, 32 bytes
      '0220' + S32,    // INTEGER, 32 bytes
    )
    const result = decodeDerSignature(der)
    expect(result.length).toBe(64)
    expect(hex(result.subarray(0, 32))).toBe(R32)
    expect(hex(result.subarray(32, 64))).toBe(S32)
  })

  it('strips leading 0x00 pad from r (33-byte integer)', () => {
    const der = fromHex(
      '3045' +                 // SEQUENCE, 69 bytes
      '022100' + R32_HIGH +    // INTEGER, 33 bytes (0x00 + r)
      '0220' + S32,            // INTEGER, 32 bytes
    )
    const result = decodeDerSignature(der)
    expect(result.length).toBe(64)
    expect(hex(result.subarray(0, 32))).toBe(R32_HIGH)
    expect(hex(result.subarray(32, 64))).toBe(S32)
  })

  it('strips leading 0x00 pad from both r and s', () => {
    const der = fromHex(
      '3046' +                 // SEQUENCE, 70 bytes
      '022100' + R32_HIGH +    // INTEGER, 33 bytes
      '022100' + S32_HIGH,     // INTEGER, 33 bytes
    )
    const result = decodeDerSignature(der)
    expect(result.length).toBe(64)
    expect(hex(result.subarray(0, 32))).toBe(R32_HIGH)
    expect(hex(result.subarray(32, 64))).toBe(S32_HIGH)
  })

  it('left-pads short r value (31 bytes)', () => {
    const rShort = '02030405060708091011121314151617181920212223242526272829303132'
    const der = fromHex(
      '3043' +              // SEQUENCE, 67 bytes
      '021f' + rShort +     // INTEGER, 31 bytes
      '0220' + S32,         // INTEGER, 32 bytes
    )
    const result = decodeDerSignature(der)
    expect(result.length).toBe(64)
    expect(hex(result.subarray(0, 32))).toBe('00' + rShort)
    expect(hex(result.subarray(32, 64))).toBe(S32)
  })

  it('throws on invalid DER (wrong outer tag)', () => {
    const der = fromHex('3100')
    expect(() => decodeDerSignature(der)).toThrow('Expected DER SEQUENCE')
  })

  it('throws on invalid DER (wrong integer tag)', () => {
    const der = fromHex('3003' + '030100')
    expect(() => decodeDerSignature(der)).toThrow('Expected DER INTEGER')
  })

  it('throws on BER indefinite-length form (0x80)', () => {
    // SEQUENCE with indefinite-length marker 0x80
    const der = fromHex('3080' + '0220' + R32 + '0220' + S32 + '0000')
    expect(() => decodeDerSignature(der)).toThrow('indefinite-length')
  })
})

describe('extractPublicKeyFromSpki', () => {
  it('extracts 64-byte public key from SPKI-encoded secp256k1 key', () => {
    const x = R32
    const y = S32
    const spki = fromHex(
      '3056' +                                   // outer SEQUENCE, 86 bytes
      '3010' +                                   // algorithm SEQUENCE, 16 bytes
      '0607' + '2a8648ce3d0201' +                // OID ecPublicKey
      '0605' + '2b8104000a' +                    // OID secp256k1
      '034200' +                                 // BIT STRING, 66 bytes, 0 unused bits
      '04' + x + y,                              // uncompressed point
    )
    const result = extractPublicKeyFromSpki(spki)
    expect(result.length).toBe(64)
    expect(hex(result.subarray(0, 32))).toBe(x)
    expect(hex(result.subarray(32, 64))).toBe(y)
  })

  it('throws on non-SEQUENCE outer tag', () => {
    const spki = fromHex('3100')
    expect(() => extractPublicKeyFromSpki(spki)).toThrow('Expected outer SEQUENCE')
  })

  it('throws on compressed point prefix', () => {
    const compressed = '02' + R32
    const spki = fromHex(
      '3036' +                                   // outer SEQUENCE
      '3010' +                                   // algorithm SEQUENCE
      '0607' + '2a8648ce3d0201' +
      '0605' + '2b8104000a' +
      '032200' +                                 // BIT STRING, 34 bytes
      compressed,
    )
    expect(() => extractPublicKeyFromSpki(spki)).toThrow('Expected uncompressed point prefix 0x04')
  })
})
