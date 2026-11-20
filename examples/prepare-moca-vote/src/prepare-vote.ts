import { readFileSync } from 'node:fs'
import { fromBech32, toBech32 } from '@cosmjs/encoding'
import {
  MocaChainAdapter,
  buildTxParts,
  computeMocaEip712Digest,
  deriveAddress,
} from '@m1ngshum/cosmos-gov-signer-adapter-moca'

const adapter = new MocaChainAdapter({ rpcEndpoint: '', lcdEndpoint: '' })
const msgExec = '/cosmos.authz.v1beta1.MsgExec'
const msgVote = '/cosmos.gov.v1.MsgVote'
const uint64Max = 2n ** 64n - 1n
const fields = [
  'chainId', 'proposalId', 'option', 'granter', 'delegate', 'delegatePublicKeyHex',
  'accountNumber', 'sequence', 'feeAmount', 'gasLimit',
]

function decimal(value: unknown, field: string, min: bigint, max: bigint): bigint {
  if (typeof value !== 'string' || value.length > String(max).length || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be a canonical decimal string`)
  }
  const number = BigInt(value)
  if (number < min || number > max) throw new Error(`${field} out of range`)
  return number
}

function address(value: unknown, role: string) {
  const error = new Error(`${role} must be a canonical ${adapter.addressPrefix} address with 20 bytes`)
  if (typeof value !== 'string') throw error
  try {
    const { prefix, data } = fromBech32(value, 43)
    if (prefix === adapter.addressPrefix && data.length === 20 && toBech32(prefix, data) === value) {
      return { bech32: value, hex: `0x${Buffer.from(data).toString('hex')}` }
    }
  } catch {
    throw error
  }
  throw error
}

function normalize(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== fields.length || !fields.every((field) => Object.hasOwn(input, field))) {
    throw new Error(`intent must contain exactly these fields: ${fields.join(', ')}`)
  }

  const raw = input as Record<string, unknown>
  if (raw.chainId !== adapter.chainId) throw new Error(`chainId must be ${adapter.chainId}`)
  const option = raw.option
  if (option !== 'YES' && option !== 'NO' && option !== 'ABSTAIN' && option !== 'NO_WITH_VETO') {
    throw new Error('option must be YES, NO, ABSTAIN or NO_WITH_VETO')
  }

  const granter = address(raw.granter, 'granter').bech32
  const delegate = address(raw.delegate, 'delegate')
  if (delegate.bech32 === granter) throw new Error('granter and delegate must be distinct')
  const publicKeyHex = raw.delegatePublicKeyHex
  if (typeof publicKeyHex !== 'string' || !/^[0-9a-fA-F]{128}$/.test(publicKeyHex)) {
    throw new Error('delegatePublicKeyHex must be 64-byte secp256k1 X || Y hex')
  }
  const delegatePublicKeyHex = publicKeyHex.toLowerCase()
  if (deriveAddress(Buffer.from(delegatePublicKeyHex, 'hex'), adapter.addressPrefix) !== delegate.bech32) {
    throw new Error('delegatePublicKeyHex must derive the delegate address')
  }

  return Object.freeze({
    chainId: adapter.chainId,
    proposalId: Number(decimal(raw.proposalId, 'proposalId', 1n, BigInt(Number.MAX_SAFE_INTEGER))),
    option,
    granter,
    delegate: delegate.bech32,
    delegateHex: delegate.hex,
    delegatePublicKeyHex,
    accountNumber: decimal(raw.accountNumber, 'accountNumber', 0n, uint64Max),
    sequence: decimal(raw.sequence, 'sequence', 0n, uint64Max),
    feeAmount: String(decimal(raw.feeAmount, 'feeAmount', 1n, 2n ** 256n - 1n)),
    gasLimit: decimal(raw.gasLimit, 'gasLimit', 1n, uint64Max),
  })
}

async function main(args: string[]) {
  if (args.length > 1 || args[0]?.startsWith('-')) {
    throw new Error('usage: prepare-vote [intent.json]')
  }
  const fixture = new URL('../synthetic-intent.json', import.meta.url)
  const contents = readFileSync(args[0] ?? fixture, 'utf8')
  let input: unknown
  try {
    input = JSON.parse(contents)
  } catch {
    throw new Error('intent file must contain valid JSON')
  }
  const intent = normalize(input)
  const { chainId, proposalId, option, granter, delegate, accountNumber, sequence, gasLimit } = intent
  const amount = [{ denom: 'amoca', amount: intent.feeAmount }]
  const vote = await adapter.buildVoteTx(proposalId, option, delegate, granter)
  const parts = buildTxParts({
    innerMsg: { typeUrl: msgExec, value: vote },
    signerPubkey: Buffer.from(intent.delegatePublicKeyHex, 'hex'),
    chainId,
    sequence,
    accountNumber,
    fee: { amount, gasLimit },
  })

  const bodyMessages = [{
    '@type': msgExec,
    grantee: delegate,
    msgs: [{ '@type': msgVote, voter: granter, proposal_id: String(proposalId), option: `VOTE_OPTION_${option}`, metadata: '' }],
  }]
  const digest = computeMocaEip712Digest({
    cosmosChainId: chainId,
    accountNumber,
    sequence,
    bodyMessages,
    fee: { amount, gas_limit: String(gasLimit), payer: '', granter: '' },
    memo: '',
    timeoutHeight: '0',
    signerAddressHex: intent.delegateHex,
  })

  console.log(JSON.stringify({
    source: args.length ? 'provided intent' : 'synthetic fixture',
    chainId,
    proposalId: String(proposalId),
    option,
    granter,
    delegate,
    delegatePublicKeyHex: intent.delegatePublicKeyHex,
    accountNumber: String(accountNumber),
    sequence: String(sequence),
    fee: { amount, gasLimit: String(gasLimit), effectivePayer: delegate },
    cosmosBodyMessagesForHash: bodyMessages,
    eip712DigestHex: `0x${digest.toString('hex')}`,
    unsignedTxBodyBase64: Buffer.from(parts.bodyBytes).toString('base64'),
    unsignedAuthInfoBase64: Buffer.from(parts.authInfoBytes).toString('base64'),
  }, null, 2))
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
