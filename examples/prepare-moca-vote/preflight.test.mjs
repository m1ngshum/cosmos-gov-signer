import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toBech32 } from '@cosmjs/encoding'
import { preflightVote } from './dist/preflight.js'

const endpoint = 'https://rest.example.test/api'
const registry = {
  chain_type: 'cosmos', chain_id: 'cosmos-fixture-1', bech32_prefix: 'cosmos',
  apis: { rest: [{ address: endpoint }] }, fees: { fee_tokens: [{ denom: 'uatom' }] },
}
const request = {
  endpoint, proposalId: '18446744073709551615', feeDenom: 'uatom', feeAmount: '9007199254740993',
  granter: toBech32('cosmos', new Uint8Array(20).fill(1)),
  delegate: toBech32('cosmos', new Uint8Array(20).fill(2)),
}
const now = Date.parse('2026-01-01T12:00:00Z')
const proposal = {
  id: request.proposalId, status: 'PROPOSAL_STATUS_VOTING_PERIOD', voting_end_time: '2026-01-01T13:00:00Z',
}
const authorization = { '@type': '/cosmos.authz.v1beta1.GenericAuthorization', msg: '/cosmos.gov.v1.MsgVote' }

function mock(overrides = {}) {
  const calls = []
  const fetcher = async (target, options) => {
    const url = new URL(target)
    calls.push(url.pathname)
    assert.equal(url.origin, 'https://rest.example.test')
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    const isBlock = url.pathname.endsWith('/blocks/latest')
    assert.equal(options.headers['x-cosmos-block-height'], isBlock ? undefined : '50')
    let body
    if (isBlock) {
      body = { sdk_block: { header: {
        chain_id: overrides.chain ?? registry.chain_id, height: '50',
        time: overrides.blockTime ?? '2026-01-01T11:59:58.999999999Z',
      } } }
    } else if (url.pathname === '/api/cosmos/gov/v1/proposals/' + request.proposalId) {
      body = { proposal: { ...proposal, ...overrides.proposal } }
    } else if (url.pathname.endsWith('/grants')) {
      assert.equal(url.searchParams.get('granter'), request.granter)
      assert.equal(url.searchParams.get('grantee'), request.delegate)
      assert.equal(url.searchParams.has('msg_type_url'), false)
      assert.equal(url.searchParams.get('pagination.limit'), '100')
      if (overrides.grantError) return new Response(null, { status: overrides.grantError })
      if (overrides.grantPage) {
        return Response.json(overrides.grantPage(url.searchParams.get('pagination.key')), {
          headers: { 'grpc-metadata-x-cosmos-block-height': '50' },
        })
      }
      body = { grants: overrides.grants ?? [{ authorization, expiration: '2026-01-01T12:30:00Z' }],
        pagination: overrides.pagination ?? null }
    } else {
      assert.equal(url.pathname, '/api/cosmos/bank/v1beta1/spendable_balances/' + request.delegate + '/by_denom')
      assert.equal(url.searchParams.get('denom'), request.feeDenom)
      body = { balance: { denom: 'uatom', amount: overrides.spendable ?? '9007199254740993' } }
    }
    return Response.json(body, { headers: isBlock ? {} : { 'grpc-metadata-x-cosmos-block-height': overrides.height ?? '50' } })
  }
  return { options: { fetcher, clock: () => now }, calls }
}

test('read-only preflight verifies the network then checks three queries at the same height', async () => {
  const { options, calls } = mock()
  const result = await preflightVote(registry, request, options)
  assert.equal(result.checksPassed, true)
  assert.equal(result.observedHeight, '50')
  assert.equal(result.fee.spendable, request.feeAmount)
  assert.equal(result.grant.expiresAt, '2026-01-01T12:30:00Z')
  assert.equal(calls.length, 4)
  assert.match(calls[0], /blocks\/latest$/)
})

test('explains closed proposals, expired or missing grants, and inadequate spendable funds', async () => {
  const { options } = mock({
    proposal: { voting_end_time: '2026-01-01T12:00:00Z' },
    grants: [{ authorization, expiration: '2026-01-01T12:00:00Z' }],
    spendable: '9007199254740992',
  })
  const result = await preflightVote(registry, request, options)
  assert.equal(result.checksPassed, false)
  assert.equal(result.proposal.open, false)
  assert.equal(result.grant.status, 'expired')
  assert.equal(result.fee.coversRequestedFee, false)
  assert.equal((await preflightVote(registry, request, mock({ grants: [] }).options)).grant.status, 'missing')
  assert.equal((await preflightVote(registry, request, mock({
    grants: [{ authorization: { '@type': '/example.CustomAuthorization' } }],
  }).options)).grant.status, 'unsupported')
})

test('rejects a mismatched network and stale block before sending addresses', async () => {
  for (const [fixture, error] of [
    [{ chain: 'different-1' }, /chain ID/],
    [{ blockTime: '2026-01-01T11:57:59Z' }, /stale/],
  ]) {
    const { options, calls } = mock(fixture)
    await assert.rejects(preflightVote(registry, request, options), error)
    assert.equal(calls.length, 1)
  }
})

test('rejects inconsistent heights, proposal IDs, partial grant results, or malformed fee data', async () => {
  for (const [fixture, error] of [
    [{ height: '51' }, /block height/],
    [{ proposal: { id: '1' } }, /Unexpected proposal/],
    [{ grants: [], pagination: { next_key: 'more' } }, /repeated grant continuation/],
    [{ spendable: '1e20' }, /spendable balance/],
  ]) {
    await assert.rejects(preflightVote(registry, request, mock(fixture).options), error)
  }
})

test('validates local inputs before any network request', async () => {
  const { options, calls } = mock()
  for (const [change, error] of [
    [{ endpoint: 'https://different.example.test' }, /listed/],
    [{ granter: 'wrong-address' }, /granter/],
    [{ proposalId: '18446744073709551616' }, /proposal ID/],
    [{ feeAmount: '0' }, /fee amount/],
  ]) {
    await assert.rejects(preflightVote(registry, { ...request, ...change }, options), error)
  }
  assert.deepEqual(calls, [])
})

test('rechecks deadlines after the queries complete', async () => {
  const { options } = mock({ proposal: { voting_end_time: '2026-01-01T12:00:01Z' } })
  const times = [now, now + 1_000]
  const result = await preflightVote(registry, request, { ...options, clock: () => times.shift() })
  assert.equal(result.proposal.open, false)
  assert.equal(result.checksPassed, false)
})

test('follows height-pinned grant pages and distinguishes absence from query failure', async () => {
  const other = { authorization: { ...authorization, msg: '/cosmos.gov.v1.MsgVoteWeighted' } }
  const grantPage = key => {
    if (key === null) return { grants: [other], pagination: { next_key: 'a+/=' } }
    assert.equal(key, 'a+/=')
    return { grants: [{ authorization, expiration: null }], pagination: { next_key: null } }
  }
  assert.equal((await preflightVote(registry, request, mock({ grantPage }).options)).grant.status, 'active')
  assert.equal((await preflightVote(registry, request, mock({ grants: [other] }).options)).grant.status, 'missing')
  await assert.rejects(preflightVote(registry, request, mock({ grantError: 404 }).options), /HTTP 404/)
})
