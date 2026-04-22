import { hashTypedData, type TypedDataParameter } from 'viem'

import {
  COMMON_TYPES,
  EIP712_DOMAIN_TYPE,
  buildMsgTypesForIndex,
  buildTxType,
} from './eip712-types.js'
import {
  type CosmosMsgJson,
  type TypedDataMessageInput,
  buildDomain,
  buildTypedDataMessage,
  parseEvmChainId,
} from './eip712-message.js'

export interface ComputeDigestInput extends Omit<TypedDataMessageInput, 'chainIdEvm'> {
  cosmosChainId: string
}

/** Build the full per-msg type map, dynamically adjusting for empty-array
 *  fields (which the chain omits from the schema via json:",omitempty"). */
function buildAllMsgTypes(bodyMessages: CosmosMsgJson[]): Record<string, TypedDataParameter[]> {
  const out: Record<string, TypedDataParameter[]> = {}
  bodyMessages.forEach((msg, i) => {
    const index = i + 1
    const hasNestedMessages =
      msg['@type'] === '/cosmos.gov.v1.MsgSubmitProposal' &&
      Array.isArray(msg['messages']) &&
      (msg['messages'] as unknown[]).length > 0
    const perMsgTypes = buildMsgTypesForIndex(msg['@type'], index, { hasNestedMessages })
    for (const [name, fields] of Object.entries(perMsgTypes)) {
      out[name] = fields
    }
  })
  return out
}

/** Whether any message in the tx body references a TypeAny[] field
 *  (MsgExec.msgs, MsgSubmitProposal.messages when non-empty). */
function needsTypeAny(bodyMessages: CosmosMsgJson[]): boolean {
  return bodyMessages.some((msg) => {
    if (msg['@type'] === '/cosmos.authz.v1beta1.MsgExec') return true
    if (
      msg['@type'] === '/cosmos.gov.v1.MsgSubmitProposal' &&
      Array.isArray(msg['messages']) &&
      (msg['messages'] as unknown[]).length > 0
    ) return true
    return false
  })
}

export function computeMocaEip712Digest(input: ComputeDigestInput): Buffer {
  const chainIdEvm = parseEvmChainId(input.cosmosChainId)
  const msgCount = input.bodyMessages.length
  if (msgCount === 0) {
    throw new Error('cannot compute EIP-712 digest: no messages in tx body')
  }

  const types: Record<string, readonly TypedDataParameter[]> = {
    EIP712Domain: EIP712_DOMAIN_TYPE,
    Tx: buildTxType(msgCount),
    Fee: COMMON_TYPES.Fee,
    Coin: COMMON_TYPES.Coin,
    ...(needsTypeAny(input.bodyMessages) ? { TypeAny: COMMON_TYPES.TypeAny } : {}),
    ...buildAllMsgTypes(input.bodyMessages),
  }

  const message = buildTypedDataMessage({ ...input, chainIdEvm })

  const digestHex = hashTypedData({
    domain: buildDomain(chainIdEvm),
    types: types as Record<string, TypedDataParameter[]>,
    primaryType: 'Tx',
    message,
  })
  return Buffer.from(digestHex.slice(2), 'hex')
}
