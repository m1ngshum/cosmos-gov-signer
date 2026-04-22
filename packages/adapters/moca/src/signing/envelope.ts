import { TxBody, AuthInfo, TxRaw, SignerInfo, ModeInfo, Fee } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing'
import { Any } from 'cosmjs-types/google/protobuf/any'
import { Coin } from 'cosmjs-types/cosmos/base/v1beta1/coin'

// MOCA chain (evmos fork) registers the ethsecp256k1 PubKey under this URL.
// Verified against devnet-2 /cosmos/auth/v1beta1/accounts/<validator> responses.
const ETHSECP_PUBKEY_TYPE_URL = '/cosmos.crypto.eth.ethsecp256k1.PubKey'

/**
 * Compress a 64-byte uncompressed secp256k1 pubkey (X || Y) to 33-byte compressed form.
 *
 * Implementation is a manual parity check rather than going through a curve-point
 * constructor: the last byte of Y tells us parity directly (even → 0x02, odd → 0x03),
 * and no curve-membership validation is needed to produce the compressed encoding.
 * This keeps the helper agnostic to noble-curves API changes across majors.
 */
export function compressEcPubkey(rawXY64: Uint8Array): Uint8Array {
  if (rawXY64.length !== 64) throw new Error(`expected 64-byte pubkey, got ${rawXY64.length}`)
  const x = rawXY64.subarray(0, 32)
  const yLastByte = rawXY64[63] ?? 0
  const prefix = (yLastByte & 1) === 0 ? 0x02 : 0x03
  const out = new Uint8Array(33)
  out[0] = prefix
  out.set(x, 1)
  return out
}

function encodePubKeyAny(compressed33: Uint8Array): Any {
  // Ethermint PubKey proto: { bytes key = 1; }
  // Manual encode: tag 1 wire-type 2 = 0x0a, length byte, then bytes.
  // Safe because compressed33 is 33 bytes (well under 127, the single-byte varint threshold).
  if (compressed33.length > 127) throw new Error('pubkey length exceeds single-byte varint')
  const body = new Uint8Array(2 + compressed33.length)
  body[0] = 0x0a
  body[1] = compressed33.length
  body.set(compressed33, 2)
  return Any.fromPartial({ typeUrl: ETHSECP_PUBKEY_TYPE_URL, value: body })
}

export interface BuildEnvelopeInput {
  readonly innerMsg: { typeUrl: string; value: Uint8Array }
  readonly signerPubkey: Uint8Array // 64-byte raw from KMS
  readonly sequence: bigint
  readonly accountNumber: bigint
  readonly chainId: string
  readonly fee: {
    readonly amount: readonly { denom: string; amount: string }[]
    readonly gasLimit: bigint
  }
  readonly memo?: string
}

export interface EnvelopeParts {
  bodyBytes: Uint8Array
  authInfoBytes: Uint8Array
}

export function buildTxParts(input: BuildEnvelopeInput): EnvelopeParts {
  const body = TxBody.fromPartial({
    messages: [Any.fromPartial(input.innerMsg)],
    memo: input.memo ?? '',
  })
  const bodyBytes = TxBody.encode(body).finish()

  const compressed = compressEcPubkey(input.signerPubkey)
  const pubkeyAny = encodePubKeyAny(compressed)

  const signerInfo = SignerInfo.fromPartial({
    publicKey: pubkeyAny,
    modeInfo: ModeInfo.fromPartial({ single: { mode: SignMode.SIGN_MODE_DIRECT } }),
    sequence: input.sequence,
  })
  const feeMsg = Fee.fromPartial({
    amount: input.fee.amount.map((c) => Coin.fromPartial(c)),
    gasLimit: input.fee.gasLimit,
  })
  const authInfo = AuthInfo.fromPartial({ signerInfos: [signerInfo], fee: feeMsg })
  const authInfoBytes = AuthInfo.encode(authInfo).finish()

  return { bodyBytes, authInfoBytes }
}

export function assembleTxRaw(parts: {
  bodyBytes: Uint8Array
  authInfoBytes: Uint8Array
  signature: Uint8Array
}): Uint8Array {
  // Cosmos secp256k1 uses 64 bytes (R||S); ethermint ethsecp256k1 uses 65 (R||S||V).
  if (parts.signature.length !== 64 && parts.signature.length !== 65) {
    throw new Error(`signature must be 64 or 65 bytes, got ${parts.signature.length}`)
  }
  const tx = TxRaw.fromPartial({
    bodyBytes: parts.bodyBytes,
    authInfoBytes: parts.authInfoBytes,
    signatures: [parts.signature],
  })
  return TxRaw.encode(tx).finish()
}
