const DER_SEQUENCE_TAG = 0x30
const DER_INTEGER_TAG = 0x02
const DER_BITSTRING_TAG = 0x03

/**
 * Read a DER tag and length at the given offset.
 * Returns the tag, the content length, and the offset after the length bytes.
 */
function readTagAndLength(
  buf: Uint8Array,
  offset: number,
): { tag: number; length: number; contentOffset: number } {
  const tag = buf[offset]
  let length = buf[offset + 1]
  let contentOffset = offset + 2

  // Long-form length (first byte has high bit set, lower 7 bits = number of length bytes)
  if (length > 0x80) {
    const numLengthBytes = length & 0x7f
    length = 0
    for (let i = 0; i < numLengthBytes; i++) {
      length = (length << 8) | buf[contentOffset + i]
    }
    contentOffset += numLengthBytes
  }

  return { tag, length, contentOffset }
}

/**
 * Normalize a DER integer to exactly `size` bytes (big-endian).
 * DER integers may have a leading 0x00 pad (if high bit is set) or be shorter than `size`.
 */
function normalizeInteger(der: Uint8Array, offset: number, length: number, size: number): Uint8Array {
  const result = new Uint8Array(size)

  // Strip leading zero padding
  let start = offset
  let len = length
  while (len > size && der[start] === 0x00) {
    start++
    len--
  }

  // Copy right-aligned into the result buffer (left-pad with zeros)
  const copyLen = Math.min(len, size)
  result.set(der.subarray(start, start + copyLen), size - copyLen)

  return result
}

/**
 * Decode a DER-encoded ECDSA signature into 64-byte compact r || s format.
 *
 * DER structure:
 *   SEQUENCE { INTEGER r, INTEGER s }
 */
export function decodeDerSignature(der: Uint8Array): Uint8Array {
  const seq = readTagAndLength(der, 0)
  if (seq.tag !== DER_SEQUENCE_TAG) {
    throw new Error(`Expected DER SEQUENCE (0x30), got 0x${seq.tag.toString(16)}`)
  }

  // Read r
  const rHeader = readTagAndLength(der, seq.contentOffset)
  if (rHeader.tag !== DER_INTEGER_TAG) {
    throw new Error(`Expected DER INTEGER (0x02) for r, got 0x${rHeader.tag.toString(16)}`)
  }
  const r = normalizeInteger(der, rHeader.contentOffset, rHeader.length, 32)

  // Read s
  const sOffset = rHeader.contentOffset + rHeader.length
  const sHeader = readTagAndLength(der, sOffset)
  if (sHeader.tag !== DER_INTEGER_TAG) {
    throw new Error(`Expected DER INTEGER (0x02) for s, got 0x${sHeader.tag.toString(16)}`)
  }
  const s = normalizeInteger(der, sHeader.contentOffset, sHeader.length, 32)

  const result = new Uint8Array(64)
  result.set(r, 0)
  result.set(s, 32)
  return result
}

/**
 * Extract the raw uncompressed public key (64 bytes, no 0x04 prefix) from a
 * DER-encoded SubjectPublicKeyInfo (SPKI) structure.
 *
 * SPKI structure:
 *   SEQUENCE {
 *     SEQUENCE { OID algorithm, OID curve }
 *     BIT STRING { 0x00 unused-bits, 0x04 || x(32) || y(32) }
 *   }
 */
export function extractPublicKeyFromSpki(spki: Uint8Array): Uint8Array {
  const outerSeq = readTagAndLength(spki, 0)
  if (outerSeq.tag !== DER_SEQUENCE_TAG) {
    throw new Error(`Expected outer SEQUENCE, got 0x${outerSeq.tag.toString(16)}`)
  }

  // Skip the algorithm SEQUENCE to find the BIT STRING
  const algoSeq = readTagAndLength(spki, outerSeq.contentOffset)
  if (algoSeq.tag !== DER_SEQUENCE_TAG) {
    throw new Error(`Expected algorithm SEQUENCE, got 0x${algoSeq.tag.toString(16)}`)
  }

  const bitStringOffset = algoSeq.contentOffset + algoSeq.length
  const bitString = readTagAndLength(spki, bitStringOffset)
  if (bitString.tag !== DER_BITSTRING_TAG) {
    throw new Error(`Expected BIT STRING, got 0x${bitString.tag.toString(16)}`)
  }

  // BIT STRING content: first byte is unused-bits count (should be 0x00),
  // then the uncompressed point: 0x04 || x(32) || y(32)
  const unusedBits = spki[bitString.contentOffset]
  if (unusedBits !== 0x00) {
    throw new Error(`Expected 0 unused bits in BIT STRING, got ${unusedBits}`)
  }

  const pointPrefix = spki[bitString.contentOffset + 1]
  if (pointPrefix !== 0x04) {
    throw new Error(`Expected uncompressed point prefix 0x04, got 0x${pointPrefix.toString(16)}`)
  }

  // Return the 64 bytes after the 0x04 prefix
  return spki.slice(bitString.contentOffset + 2, bitString.contentOffset + 2 + 64)
}
