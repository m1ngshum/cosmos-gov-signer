import { describe, it, expect } from 'vitest'
import { simulateJsonpbString, jsonStringifySorted, hexToBytes } from '../signing/eip712-message.js'

describe('simulateJsonpbString', () => {
  it('passes through ASCII bytes unchanged', () => {
    const bytes = new TextEncoder().encode('hello world')
    expect(simulateJsonpbString(bytes)).toBe('hello world')
  })

  it('preserves valid 2-byte UTF-8 sequences', () => {
    // é = U+00E9 = 0xC3 0xA9
    expect(simulateJsonpbString(new Uint8Array([0xc3, 0xa9]))).toBe('é')
  })

  it('preserves valid 3-byte UTF-8 sequences', () => {
    // € = U+20AC = 0xE2 0x82 0xAC
    expect(simulateJsonpbString(new Uint8Array([0xe2, 0x82, 0xac]))).toBe('€')
  })

  it('preserves valid 4-byte UTF-8 sequences', () => {
    // 😀 = U+1F600 = 0xF0 0x9F 0x98 0x80
    expect(simulateJsonpbString(new Uint8Array([0xf0, 0x9f, 0x98, 0x80]))).toBe('😀')
  })

  it('replaces lone continuation bytes with U+FFFD', () => {
    expect(simulateJsonpbString(new Uint8Array([0x80]))).toBe('\uFFFD')
    expect(simulateJsonpbString(new Uint8Array([0xbf]))).toBe('\uFFFD')
  })

  it('replaces truncated multi-byte sequences with U+FFFD', () => {
    // 0xC2 expects one continuation byte
    expect(simulateJsonpbString(new Uint8Array([0xc2]))).toBe('\uFFFD')
  })

  it('replaces invalid lead bytes (C0, C1, F5..FF)', () => {
    expect(simulateJsonpbString(new Uint8Array([0xc0]))).toBe('\uFFFD')
    expect(simulateJsonpbString(new Uint8Array([0xc1]))).toBe('\uFFFD')
    expect(simulateJsonpbString(new Uint8Array([0xf5]))).toBe('\uFFFD')
    expect(simulateJsonpbString(new Uint8Array([0xff]))).toBe('\uFFFD')
  })

  it('replaces overlong encodings with U+FFFD', () => {
    // 0xC0 0x80 is an overlong encoding of NUL
    expect(simulateJsonpbString(new Uint8Array([0xc0, 0x80]))).toBe('\uFFFD\uFFFD')
  })

  it('replaces surrogate codepoints (0xED 0xA0..0xBF) with U+FFFD', () => {
    // 0xED 0xA0 0x80 = U+D800 (high surrogate) — invalid in UTF-8
    expect(simulateJsonpbString(new Uint8Array([0xed, 0xa0, 0x80]))).toBe('\uFFFD\uFFFD\uFFFD')
  })

  it('handles mixed valid/invalid sequences in a raw 20-byte address', () => {
    // From docs/debug fixture — proposer 0x195A190FCd48e939F0E33A68eDDE28b4269000a2
    const bytes = hexToBytes('0x195A190FCd48e939F0E33A68eDDE28b4269000a2')
    const out = simulateJsonpbString(bytes)
    expect(out.length).toBe(20)
    // First 4 bytes (0x19 0x5A 0x19 0x0F) are ASCII
    expect(out.charCodeAt(0)).toBe(0x19)
    expect(out.charCodeAt(1)).toBe(0x5A)
    // 0xCD is invalid → U+FFFD
    expect(out.charCodeAt(4)).toBe(0xFFFD)
  })
})

describe('jsonStringifySorted', () => {
  it('matches Go json.Marshal(map) key ordering', () => {
    const out = jsonStringifySorted({ b: 2, a: 1, c: 3 })
    expect(out).toBe('{"a":1,"b":2,"c":3}')
  })

  it('sorts nested object keys', () => {
    const out = jsonStringifySorted({ outer: { z: 1, a: 2 } })
    expect(out).toBe('{"outer":{"a":2,"z":1}}')
  })

  it('preserves array order', () => {
    expect(jsonStringifySorted([3, 1, 2])).toBe('[3,1,2]')
  })

  it('@type sorts before lowercase keys', () => {
    // ASCII '@' = 0x40, 'a' = 0x61 — so @type comes first alphabetically
    const out = jsonStringifySorted({ voter: 'v', '@type': 'T', metadata: '' })
    expect(out).toBe('{"@type":"T","metadata":"","voter":"v"}')
  })
})
