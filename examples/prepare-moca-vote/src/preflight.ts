import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { fromBech32, toBech32 } from '@cosmjs/encoding'

const voteType = '/cosmos.gov.v1.MsgVote'

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${field}`)
  return value as Record<string, unknown>
}

function integer(value: unknown, field: string, max: bigint, min = 0n): bigint {
  if (typeof value !== 'string' || value.length > String(max).length || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`Invalid ${field}`)
  }
  const n = BigInt(value)
  if (n < min || n > max) throw new Error(`Invalid ${field}`)
  return n
}

function utc(value: unknown, field: string): number {
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)) {
    const time = Date.parse(value)
    if (Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19)) return time
  }
  throw new Error(`Invalid ${field}`)
}

function account(value: string, prefix: string, role: string) {
  try {
    const decoded = fromBech32(value, 90)
    if (decoded.prefix === prefix && decoded.data.length === 20 && toBech32(prefix, decoded.data) === value) return
  } catch {
    // Preserve a stable diagnostic without echoing the input.
  }
  throw new Error(`Invalid ${role} account address`)
}

type VoteRequest = {
  endpoint: string
  proposalId: string
  granter: string
  delegate: string
  feeDenom: string
  feeAmount: string
}

export async function preflightVote(
  registryEntry: unknown,
  request: VoteRequest,
  { fetcher = fetch, clock = Date.now } = {},
) {
  const chain = object(registryEntry, 'chain registry entry')
  if ((chain.chain_type !== undefined && chain.chain_type !== 'cosmos') ||
      typeof chain.chain_id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(chain.chain_id) ||
      typeof chain.bech32_prefix !== 'string' || !/^[a-z][a-z0-9]{0,30}$/.test(chain.bech32_prefix)) {
    throw new Error('Invalid Cosmos chain registry metadata')
  }

  const rest = object(chain.apis, 'registry APIs').rest
  if (!Array.isArray(rest) || !rest.some(api => api && api.address === request.endpoint)) {
    throw new Error('Select a REST endpoint listed in the local chain.json')
  }
  let endpoint: URL
  try { endpoint = new URL(request.endpoint) } catch { throw new Error('Invalid REST URL') }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('REST URL must use HTTPS without credentials, query, or fragment')
  }

  const { granter, delegate, proposalId, feeDenom, feeAmount } = request
  account(granter, chain.bech32_prefix, 'granter')
  account(delegate, chain.bech32_prefix, 'delegate')
  if (granter === delegate) throw new Error('Granter and delegate must differ')
  const uint64 = 2n ** 64n - 1n
  const coinMax = 2n ** 256n - 1n
  integer(proposalId, 'proposal ID', uint64, 1n)
  const tokens = object(chain.fees, 'registry fees').fee_tokens
  if (!/^[A-Za-z][A-Za-z0-9/:._-]{2,127}$/.test(feeDenom) ||
      !Array.isArray(tokens) || !tokens.some(token => token && token.denom === feeDenom)) {
    throw new Error('Select a fee denomination listed in chain.json')
  }
  const required = integer(feeAmount, 'fee amount', coinMax, 1n)

  const base = endpoint.href.replace(/\/$/, '')
  const signal = AbortSignal.timeout(12_000)
  async function get(path: string, height?: string, query?: URLSearchParams) {
    const response = await fetcher(base + path + (query ? '?' + query : ''), {
      method: 'GET',
      redirect: 'error',
      signal,
      headers: height ? { 'x-cosmos-block-height': height } : {},
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`REST query failed (HTTP ${response.status})`)
    }
    const headers = ['grpc-metadata-x-cosmos-block-height', 'x-cosmos-block-height']
      .map(name => response.headers.get(name)).filter(value => value !== null)
    if (height && (!headers.length || headers.some(value => value !== height))) {
      await response.body.cancel()
      throw new Error('REST endpoint did not confirm the requested block height')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2_000_000) {
        await reader.cancel()
        throw new Error('REST response exceeds 2 MB')
      }
      chunks.push(value)
    }
    let data: unknown
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('Invalid REST JSON') }
    return object(data, 'REST response')
  }

  const latest = await get('/cosmos/base/tendermint/v1beta1/blocks/latest')
  const header = object(object(latest.sdk_block ?? latest.block, 'latest block').header, 'block header')
  if (header.chain_id !== chain.chain_id) throw new Error('REST endpoint chain ID differs from chain.json')
  integer(header.height, 'block height', 2n ** 63n - 1n, 1n)
  const height = header.height as string
  const blockTime = utc(header.time, 'block time')
  const checkedBlockAt = clock()
  if (blockTime < checkedBlockAt - 120_000 || blockTime > checkedBlockAt + 30_000) throw new Error('REST endpoint block time is stale or in the future')

  // The SDK's message-scoped lookup errors on absence. A complete pair
  // listing can distinguish a missing grant from a failed query.
  async function listVoteGrant() {
    const query = new URLSearchParams({ granter, grantee: delegate, 'pagination.limit': '100' })
    const seen = new Set<string>()
    let unsupported = false
    let voteGrant: Record<string, unknown> | undefined
    for (let page = 0; page < 10; page++) {
      const reply = await get('/cosmos/authz/v1beta1/grants', height, query)
      if (!Array.isArray(reply.grants)) throw new Error('Invalid grant listing')
      for (const value of reply.grants) {
        const entry = object(value, 'grant listing entry')
        const auth = object(entry.authorization, 'grant authorization')
        if (typeof auth['@type'] !== 'string' || !auth['@type']) throw new Error('Invalid grant authorization type')
        if (auth['@type'] !== '/cosmos.authz.v1beta1.GenericAuthorization') {
          unsupported = true
        } else {
          if (typeof auth.msg !== 'string' || !auth.msg) throw new Error('Invalid generic grant message')
          if (auth.msg === voteType) {
            if (voteGrant) throw new Error('Duplicate generic vote grant')
            voteGrant = entry
          }
        }
      }
      const next = reply.pagination == null ? null : object(reply.pagination, 'grant pagination').next_key
      if (next == null || next === '') return { voteGrant, unsupported }
      if (typeof next !== 'string' || next.length > 4096 || seen.has(next)) {
        throw new Error('Invalid or repeated grant continuation key')
      }
      seen.add(next)
      query.set('pagination.key', next)
    }
    throw new Error('Grant listing exceeds 10 pages')
  }

  const [proposalReply, { voteGrant, unsupported }, balanceReply] = await Promise.all([
    get(`/cosmos/gov/v1/proposals/${proposalId}`, height),
    listVoteGrant(),
    get(`/cosmos/bank/v1beta1/spendable_balances/${delegate}/by_denom`, height, new URLSearchParams({ denom: feeDenom })),
  ])
  const proposal = object(proposalReply.proposal, 'proposal')
  if (proposal.id !== proposalId || ![
    'DEPOSIT_PERIOD', 'VOTING_PERIOD', 'PASSED', 'REJECTED', 'FAILED',
  ].some(status => proposal.status === 'PROPOSAL_STATUS_' + status)) throw new Error('Unexpected proposal or status')
  const deadline = proposal.voting_end_time == null ? null : utc(proposal.voting_end_time, 'voting deadline')
  if (proposal.status === 'PROPOSAL_STATUS_VOTING_PERIOD' && deadline === null) throw new Error('Voting proposal has no deadline')
  const checkedAt = clock()
  const when = Math.max(checkedAt, blockTime)
  const proposalOpen = proposal.status === 'PROPOSAL_STATUS_VOTING_PERIOD' && deadline !== null && deadline > when

  let grant: { status: 'missing' | 'unsupported' | 'expired' | 'active'; expiresAt: string | null } = {
    status: unsupported ? 'unsupported' : 'missing', expiresAt: null,
  }
  if (voteGrant) {
    const expiry = voteGrant.expiration == null ? null : utc(voteGrant.expiration, 'grant expiration')
    grant = {
      status: expiry !== null && expiry <= when ? 'expired' : 'active',
      expiresAt: expiry === null ? null : voteGrant.expiration as string,
    }
  }
  const balance = object(balanceReply.balance, 'spendable balance')
  if (balance.denom !== feeDenom) throw new Error('Unexpected spendable balance denomination')
  const spendable = integer(balance.amount, 'spendable balance', coinMax)
  return {
    chainId: chain.chain_id,
    observedHeight: height,
    observedBlockTime: header.time,
    checkedAt: new Date(checkedAt).toISOString(),
    granter,
    delegate,
    proposal: { id: proposalId, status: proposal.status, deadline: proposal.voting_end_time ?? null, open: proposalOpen },
    grant,
    fee: { denom: feeDenom, requested: feeAmount, spendable: String(spendable), coversRequestedFee: spendable >= required },
    checksPassed: proposalOpen && grant.status === 'active' && spendable >= required,
  }
}

async function main(args: string[]) {
  if (args.length !== 7) {
    throw new Error('usage: preflight <chain.json> <rest-url> <proposal-id> <granter> <delegate> <fee-denom> <fee-amount>')
  }
  const [file, endpoint, proposalId, granter, delegate, feeDenom, feeAmount] = args as [
    string, string, string, string, string, string, string,
  ]
  const contents = readFileSync(file, 'utf8')
  let entry: unknown
  try { entry = JSON.parse(contents) } catch { throw new Error('chain.json must contain valid JSON') }
  const result = await preflightVote(entry, { endpoint, proposalId, granter, delegate, feeDenom, feeAmount })
  console.log(JSON.stringify(result, null, 2))
  if (!result.checksPassed) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : 'Preflight failed')
    process.exitCode = 1
  })
}
