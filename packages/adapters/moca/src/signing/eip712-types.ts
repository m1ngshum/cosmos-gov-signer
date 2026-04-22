import type { TypedDataParameter } from 'viem'

// EIP712Domain field order matches chain's sort.Slice(alphabetical) output.
// See docs/debug/typed-flowc-chain-reference.json.
export const EIP712_DOMAIN_TYPE: readonly TypedDataParameter[] = [
  { name: 'chainId', type: 'uint256' },
  { name: 'name', type: 'string' },
  { name: 'salt', type: 'string' },
  { name: 'verifyingContract', type: 'string' },
  { name: 'version', type: 'string' },
]

// Global Coin type is used by Fee.amount only. Per-msg initial_deposit uses
// a per-msg-named type (see buildMsgTypesForIndex).
export const COMMON_TYPES = {
  Coin: [
    { name: 'amount', type: 'uint256' },
    { name: 'denom', type: 'string' },
  ],
  Fee: [
    { name: 'amount', type: 'Coin[]' },
    { name: 'gas_limit', type: 'uint256' },
    { name: 'granter', type: 'string' },
    { name: 'payer', type: 'string' },
  ],
  TypeAny: [
    { name: 'type', type: 'string' },
    { name: 'value', type: 'bytes' },
  ],
} as const satisfies Record<string, readonly TypedDataParameter[]>

export interface BuildMsgSchemaOptions {
  /** Whether MsgSubmitProposal.messages has any entries — empty + omitempty
   *  means the field is removed from schema + value. */
  readonly hasNestedMessages?: boolean
}

/** Build the per-msg-index type schemas for a given message type URL.
 *  Returns a map of type name → fields. Always includes `Msg{N}`. May include
 *  `TypeMsg{N}InitialDeposit` (for MsgSubmitProposal) etc. Field arrays are
 *  returned already alphabetised (matches chain's final sort.Slice). */
export function buildMsgTypesForIndex(
  typeUrl: string,
  index: number,
  options: BuildMsgSchemaOptions = {},
): Record<string, TypedDataParameter[]> {
  switch (typeUrl) {
    case '/cosmos.gov.v1.MsgSubmitProposal':
      return buildMsgSubmitProposalTypes(index, options)
    case '/cosmos.gov.v1.MsgVote':
      return buildMsgVoteTypes(index)
    case '/cosmos.authz.v1beta1.MsgExec':
      return buildMsgExecTypes(index)
    default:
      throw new Error(
        `No EIP-712 schema registered for ${typeUrl}. Add one in eip712-types.ts.`,
      )
  }
}

function buildMsgSubmitProposalTypes(
  index: number,
  { hasNestedMessages = false }: BuildMsgSchemaOptions,
): Record<string, TypedDataParameter[]> {
  const depositTypeName = `TypeMsg${index}InitialDeposit`
  const fields: TypedDataParameter[] = [
    { name: 'expedited', type: 'bool' },
    { name: 'initial_deposit', type: `${depositTypeName}[]` },
    { name: 'metadata', type: 'string' },
    { name: 'proposer', type: 'string' },
    { name: 'summary', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'type', type: 'string' },
  ]
  if (hasNestedMessages) {
    fields.push({ name: 'messages', type: 'TypeAny[]' })
  }
  return {
    [`Msg${index}`]: fields.sort((a, b) => a.name.localeCompare(b.name)),
    [depositTypeName]: [
      { name: 'amount', type: 'string' },
      { name: 'denom', type: 'string' },
    ],
  }
}

function buildMsgVoteTypes(index: number): Record<string, TypedDataParameter[]> {
  return {
    [`Msg${index}`]: [
      { name: 'metadata', type: 'string' },
      { name: 'option', type: 'string' },
      { name: 'proposal_id', type: 'uint64' },
      { name: 'type', type: 'string' },
      { name: 'voter', type: 'string' },
    ],
  }
}

function buildMsgExecTypes(index: number): Record<string, TypedDataParameter[]> {
  return {
    [`Msg${index}`]: [
      { name: 'grantee', type: 'string' },
      { name: 'msgs', type: 'TypeAny[]' },
      { name: 'type', type: 'string' },
    ],
  }
}

/** Top-level Tx type. Alphabetised; msg1, msg2...msgN added as Msg1, Msg2.
 *  Order matches chain's sort.Slice output. */
export function buildTxType(msgCount: number): TypedDataParameter[] {
  const base: TypedDataParameter[] = [
    { name: 'account_number', type: 'uint256' },
    { name: 'chain_id', type: 'uint256' },
    { name: 'fee', type: 'Fee' },
    { name: 'memo', type: 'string' },
    { name: 'sequence', type: 'uint256' },
    { name: 'timeout_height', type: 'uint256' },
  ]
  const msgs: TypedDataParameter[] = []
  for (let i = 1; i <= msgCount; i += 1) {
    msgs.push({ name: `msg${i}`, type: `Msg${i}` })
  }
  return [...base, ...msgs].sort((a, b) => a.name.localeCompare(b.name))
}
