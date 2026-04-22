import type { TypedDataDomain } from 'viem'
import { TYPE_URLS } from '../proto.js'

export interface CosmosMsgJson {
  '@type': string
  [field: string]: unknown
}

export interface TypedDataMessageInput {
  bodyMessages: CosmosMsgJson[]
  fee: {
    amount: Array<{ denom: string; amount: string }>
    gas_limit: string
    payer?: string
    granter?: string
  }
  memo: string
  timeoutHeight: string
  accountNumber: number | bigint
  sequence: number | bigint
  chainIdEvm: number
  /** 0x-prefixed hex address of the primary signer. Used to simulate the chain's
   *  FeePayer() fallback when AuthInfo.Fee.Payer is empty: chain returns the
   *  first signer's address as raw bytes, which are then JSON-marshalled (with
   *  UTF-8 validation replacing invalid sequences by U+FFFD) before hashing.
   *  See docs/debug/typed-flowc-chain-reference.json for the concrete shape. */
  signerAddressHex: string
}

export function parseEvmChainId(cosmosChainId: string): number {
  const m = cosmosChainId.match(/_(\d+)-\d+$/)
  if (!m) throw new Error(`cannot parse EVM chain id from ${cosmosChainId}`)
  const n = Number(m[1])
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) {
    throw new Error(`invalid EVM chain id ${m[1]} parsed from ${cosmosChainId}`)
  }
  return n
}

export function buildDomain(chainIdEvm: number): TypedDataDomain {
  return {
    name: 'Moca Tx',
    version: '1.0.0',
    chainId: chainIdEvm,
    verifyingContract: 'moca' as `0x${string}`,
    salt: '0' as `0x${string}`,
  } as TypedDataDomain
}

/** Decode a 0x-prefixed hex string to raw bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex
  if (stripped.length % 2 !== 0) {
    throw new Error(`hex string length must be even: ${hex}`)
  }
  const out = new Uint8Array(stripped.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(stripped.substr(i * 2, 2), 16)
  }
  return out
}

/** Simulate Go's UTF-8 validation of an arbitrary byte sequence (as used by
 *  jsonpb / encoding/json). Invalid UTF-8 bytes/sequences are replaced by
 *  U+FFFD, exactly as Go does when marshalling a `[]byte`-cast string.
 *
 *  When the resulting JS string is later UTF-8 encoded (e.g. via viem's
 *  textEncoder in toHex), the output bytes match what go-ethereum's string
 *  hasher receives. This is how we match the chain's `fee.payer` hash when
 *  Fee.Payer is empty and the chain falls back to `string(AccAddress)`. */
export function simulateJsonpbString(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]!
    if (b < 0x80) {
      out += String.fromCharCode(b)
      i += 1
      continue
    }
    let width = 0
    if (b >= 0xc2 && b <= 0xdf) width = 2
    else if (b >= 0xe0 && b <= 0xef) width = 3
    else if (b >= 0xf0 && b <= 0xf4) width = 4

    if (width === 0 || i + width > bytes.length) {
      out += '\uFFFD'
      i += 1
      continue
    }
    let valid = true
    for (let k = 1; k < width; k += 1) {
      const c = bytes[i + k]!
      if (c < 0x80 || c > 0xbf) {
        valid = false
        break
      }
    }
    if (!valid) {
      out += '\uFFFD'
      i += 1
      continue
    }
    let cp = 0
    if (width === 2) cp = ((b & 0x1f) << 6) | (bytes[i + 1]! & 0x3f)
    else if (width === 3) cp = ((b & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f)
    else cp = ((b & 0x07) << 18) | ((bytes[i + 1]! & 0x3f) << 12) | ((bytes[i + 2]! & 0x3f) << 6) | (bytes[i + 3]! & 0x3f)

    const overlong =
      (width === 2 && cp < 0x80) ||
      (width === 3 && cp < 0x800) ||
      (width === 4 && cp < 0x10000)
    if (overlong || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) {
      out += '\uFFFD'
      i += 1
      continue
    }
    out += String.fromCodePoint(cp)
    i += width
  }
  return out
}

/** Encode an object as JSON with alphabetically-sorted keys — matches Go's
 *  `json.Marshal(map[string]interface{})`. Used to produce the exact bytes the
 *  chain hashes for TypeAny.value on array-of-Any fields. */
export function jsonStringifySorted(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => jsonStringifySorted(v)).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + jsonStringifySorted(obj[k]))
      .join(',') +
    '}'
  )
}

export function buildPerMsgValue(msg: CosmosMsgJson): Record<string, unknown> {
  const typeUrl = msg['@type']
  switch (typeUrl) {
    case TYPE_URLS.msgSubmitProposal:
      return buildMsgSubmitProposalValue(msg)
    case TYPE_URLS.msgVote:
      return buildMsgVoteValue(msg)
    case TYPE_URLS.msgExec:
      return buildMsgExecValue(msg)
    default:
      throw new Error(`Unhandled msg type ${typeUrl}`)
  }
}

function buildMsgSubmitProposalValue(msg: CosmosMsgJson): Record<string, unknown> {
  const nested = (msg['messages'] as CosmosMsgJson[] | undefined) ?? []
  const value: Record<string, unknown> = {
    type: msg['@type'],
    expedited: Boolean(msg['expedited']),
    initial_deposit: (msg['initial_deposit'] as Array<{ denom: string; amount: string }>).map(
      (c) => ({ amount: c.amount, denom: c.denom }),
    ),
    metadata: String(msg['metadata'] ?? ''),
    proposer: String(msg['proposer']),
    summary: String(msg['summary'] ?? ''),
    title: String(msg['title'] ?? ''),
  }
  if (nested.length > 0) {
    value['messages'] = nested.map(wrapAsTypeAny)
  }
  return value
}

function buildMsgVoteValue(msg: CosmosMsgJson): Record<string, unknown> {
  return {
    type: msg['@type'],
    metadata: String(msg['metadata'] ?? ''),
    option: String(msg['option']),
    proposal_id: String(msg['proposal_id']),
    voter: String(msg['voter']),
  }
}

function buildMsgExecValue(msg: CosmosMsgJson): Record<string, unknown> {
  return {
    type: msg['@type'],
    grantee: String(msg['grantee']),
    msgs: (msg['msgs'] as CosmosMsgJson[]).map(wrapAsTypeAny),
  }
}

/** For an element of an Any[] field: chain encodes as { type: @type URL,
 *  value: <JSON bytes of the full Any map with keys sorted alphabetically> }.
 *  See docs/debug/typed-flowa-chain-reference.json: msg1.msgs[0].value is the
 *  base64 form of exactly those JSON bytes. */
function wrapAsTypeAny(msg: CosmosMsgJson): { type: string; value: Uint8Array } {
  const jsonString = jsonStringifySorted(normaliseInnerMsg(msg))
  const value = new TextEncoder().encode(jsonString)
  return { type: msg['@type'], value }
}

/** Normalise an inner cosmos message for inclusion in an Any.value JSON blob.
 *  Must mirror jsonpb (EmitDefaults: true, OrigName: true) output exactly. */
function normaliseInnerMsg(msg: CosmosMsgJson): Record<string, unknown> {
  switch (msg['@type']) {
    case TYPE_URLS.msgVote:
      return {
        '@type': msg['@type'],
        metadata: String(msg['metadata'] ?? ''),
        option: String(msg['option']),
        proposal_id: String(msg['proposal_id']),
        voter: String(msg['voter']),
      }
    default:
      throw new Error(`normaliseInnerMsg: unhandled inner type ${msg['@type']}`)
  }
}

export function buildTypedDataMessage(input: TypedDataMessageInput): Record<string, unknown> {
  const signerBytes = hexToBytes(input.signerAddressHex)
  const feePayer =
    input.fee.payer && input.fee.payer.length > 0
      ? input.fee.payer
      : simulateJsonpbString(signerBytes)

  const message: Record<string, unknown> = {
    account_number: String(input.accountNumber),
    chain_id: String(input.chainIdEvm),
    fee: {
      amount: input.fee.amount.map((c) => ({ amount: c.amount, denom: c.denom })),
      gas_limit: input.fee.gas_limit,
      granter: input.fee.granter ?? '',
      payer: feePayer,
    },
    memo: input.memo ?? '',
    sequence: String(input.sequence),
    timeout_height: input.timeoutHeight ?? '0',
  }
  input.bodyMessages.forEach((msg, i) => {
    message[`msg${i + 1}`] = buildPerMsgValue(msg)
  })
  return message
}
