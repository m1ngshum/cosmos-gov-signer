import { describe, it, expect, vi, beforeEach } from 'vitest'

// 32-byte test values
const R32 = '0102030405060708091011121314151617181920212223242526272829303132'
const S32 = '3334353637383940414243444546474849505152535455565758596061626364'
const X32 = R32
const Y32 = S32

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

// Build a valid DER signature for r=R32, s=S32
function makeDerSignature(): Uint8Array {
  return fromHex('3044' + '0220' + R32 + '0220' + S32)
}

// Build a valid SPKI for secp256k1 with x=X32, y=Y32
function makeSpki(): Uint8Array {
  return fromHex(
    '3056' +
    '3010' +
    '0607' + '2a8648ce3d0201' +
    '0605' + '2b8104000a' +
    '034200' +
    '04' + X32 + Y32,
  )
}

// vi.mock is hoisted — any symbols its factory references must be declared
// inside vi.hoisted() so they exist when the factory runs. vitest 4 tightened
// this: the factory must return constructable classes with proper prototype
// semantics (v3's arrow-function-returning-object shape now fails with
// "() => ({...}) is not a constructor"). SignCommand additionally needs to
// be a spy because the test asserts toHaveBeenCalledWith on it.
const { mockSend, SignCommandMock, GetPublicKeyCommandMock } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  SignCommandMock: vi.fn(function (this: { input: unknown }, input: unknown) {
    this.input = input
  }),
  GetPublicKeyCommandMock: vi.fn(function (this: { input: unknown }, input: unknown) {
    this.input = input
  }),
}))

vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: class {
    send = mockSend
  },
  SignCommand: SignCommandMock,
  GetPublicKeyCommand: GetPublicKeyCommandMock,
}))

// Import after mock setup
const { signWithKMS, getKMSPublicKey } = await import('../kms-signer.js')

describe('signWithKMS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 64-byte compact signature from KMS DER response', async () => {
    mockSend.mockResolvedValueOnce({ Signature: makeDerSignature() })

    const msgHash = new Uint8Array(32).fill(0xab)
    const result = await signWithKMS('key-123', msgHash, 'ap-southeast-1')

    expect(result.length).toBe(64)
    expect(hex(result.subarray(0, 32))).toBe(R32)
    expect(hex(result.subarray(32, 64))).toBe(S32)
  })

  it('passes correct parameters to KMS SignCommand', async () => {
    mockSend.mockResolvedValueOnce({ Signature: makeDerSignature() })
    const { SignCommand } = await import('@aws-sdk/client-kms')

    const msgHash = new Uint8Array(32).fill(0xab)
    await signWithKMS('key-123', msgHash, 'ap-southeast-1')

    expect(SignCommand).toHaveBeenCalledWith({
      KeyId: 'key-123',
      Message: msgHash,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    })
  })

  it('throws when KMS returns empty signature', async () => {
    mockSend.mockResolvedValueOnce({ Signature: undefined })

    await expect(
      signWithKMS('key-123', new Uint8Array(32), 'us-east-1'),
    ).rejects.toThrow('KMS Sign returned empty signature')
  })

  it('propagates KMS errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('AccessDeniedException'))

    await expect(
      signWithKMS('key-123', new Uint8Array(32), 'us-east-1'),
    ).rejects.toThrow('AccessDeniedException')
  })

  it('rejects non-32-byte msgHash', async () => {
    await expect(
      signWithKMS('key-123', new Uint8Array(64), 'us-east-1'),
    ).rejects.toThrow('32-byte digest')

    await expect(
      signWithKMS('key-123', new Uint8Array(16), 'us-east-1'),
    ).rejects.toThrow('32-byte digest')
  })
})

describe('getKMSPublicKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 64-byte raw public key from KMS SPKI response', async () => {
    mockSend.mockResolvedValueOnce({ PublicKey: makeSpki() })

    const result = await getKMSPublicKey('key-456', 'ap-southeast-1')

    expect(result.length).toBe(64)
    expect(hex(result.subarray(0, 32))).toBe(X32)
    expect(hex(result.subarray(32, 64))).toBe(Y32)
  })

  it('throws when KMS returns empty public key', async () => {
    mockSend.mockResolvedValueOnce({ PublicKey: undefined })

    await expect(
      getKMSPublicKey('key-456', 'us-east-1'),
    ).rejects.toThrow('KMS GetPublicKey returned empty key')
  })

  it('propagates KMS errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('NotFoundException'))

    await expect(
      getKMSPublicKey('key-456', 'us-east-1'),
    ).rejects.toThrow('NotFoundException')
  })
})
