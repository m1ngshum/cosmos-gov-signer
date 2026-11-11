const DER_SEQUENCE_TAG = 0x30
const DER_INTEGER_TAG = 0x02
const DER_BITSTRING_TAG = 0x03

function readTagAndLength(buf: Uint8Array, offset: number) {
  if (offset + 2 > buf.length) throw new Error('Truncated DER header')
  const tag = buf[offset]!
  let length = buf[offset + 1]!
  let contentOffset = offset + 2
  if (length === 0x80) throw new Error('DER indefinite-length form is not permitted')
  if (length > 0x80) {
    const count = length & 0x7f
    if (count > 4 || contentOffset + count > buf.length || buf[contentOffset] === 0) {
      throw new Error('Invalid DER length')
    }
    length = 0
    for (let i = 0; i < count; i++) length = length * 256 + buf[contentOffset + i]!
    contentOffset += count
    if (length < 128) throw new Error('Noncanonical DER length')
  }
  const end = contentOffset + length
  if (end > buf.length) throw new Error('Truncated DER content')
  return { tag, length, contentOffset, end }
}

function readInteger(der: Uint8Array, offset: number): { value: Uint8Array; end: number } {
  const part = readTagAndLength(der, offset)
  if (part.tag !== DER_INTEGER_TAG) throw new Error('Expected DER INTEGER')
  let bytes = der.subarray(part.contentOffset, part.end)
  if (!bytes.length || (bytes[0]! & 0x80)) throw new Error('Expected positive DER integer')
  if (bytes.length > 1 && bytes[0] === 0) {
    if (!(bytes[1]! & 0x80)) throw new Error('Noncanonical DER integer padding')
    bytes = bytes.subarray(1)
  }
  if (bytes.length > 32 || bytes.every(byte => byte === 0)) {
    throw new Error('DER integer must be nonzero and fit in 32 bytes')
  }
  const value = new Uint8Array(32)
  value.set(bytes, 32 - bytes.length)
  return { value, end: part.end }
}

/** Convert a complete canonical DER ECDSA signature to 64-byte r || s. */
export function decodeDerSignature(der: Uint8Array): Uint8Array {
  const seq = readTagAndLength(der, 0)
  if (seq.tag !== DER_SEQUENCE_TAG) throw new Error('Expected DER SEQUENCE')
  if (seq.end !== der.length) throw new Error('Trailing DER signature data')
  const r = readInteger(der, seq.contentOffset)
  const s = readInteger(der, r.end)
  if (s.end !== seq.end) throw new Error('Invalid DER signature sequence')
  const result = new Uint8Array(64)
  result.set(r.value)
  result.set(s.value, 32)
  return result
}

/** Extract a complete uncompressed secp256k1 public key from canonical DER SPKI. */
export function extractPublicKeyFromSpki(spki: Uint8Array): Uint8Array {
  const outer = readTagAndLength(spki, 0)
  if (outer.tag !== DER_SEQUENCE_TAG) throw new Error('Expected outer SEQUENCE')
  if (outer.end !== spki.length) throw new Error('Trailing SPKI data')
  const algo = readTagAndLength(spki, outer.contentOffset)
  if (algo.tag !== DER_SEQUENCE_TAG) throw new Error('Expected algorithm SEQUENCE')
  // id-ecPublicKey and the named secp256k1 curve, with no extra parameters.
  const expectedAlgorithm = Buffer.from('06072a8648ce3d020106052b8104000a', 'hex')
  if (!Buffer.from(spki.subarray(algo.contentOffset, algo.end)).equals(expectedAlgorithm)) {
    throw new Error('Expected id-ecPublicKey with secp256k1 curve')
  }
  const point = readTagAndLength(spki, algo.end)
  if (point.tag !== DER_BITSTRING_TAG) throw new Error('Expected BIT STRING')
  if (point.end !== outer.end) throw new Error('Invalid SPKI sequence')
  if (spki[point.contentOffset] !== 0) throw new Error('Expected 0 unused bits')
  if (spki[point.contentOffset + 1] !== 0x04) throw new Error('Expected uncompressed point prefix 0x04')
  if (point.length !== 66) throw new Error('Expected complete 64-byte public key')
  return spki.slice(point.contentOffset + 2, point.end)
}
