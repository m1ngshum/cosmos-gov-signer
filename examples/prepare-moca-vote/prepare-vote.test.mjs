import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { toBech32 } from '@cosmjs/encoding'
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx'
import { VoteOption, voteOptionToJSON } from 'cosmjs-types/cosmos/gov/v1/gov'
import { MsgVote } from 'cosmjs-types/cosmos/gov/v1/tx'
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys'
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing'
import { AuthInfo, TxBody } from 'cosmjs-types/cosmos/tx/v1beta1/tx'

const adapterUrl = import.meta.resolve('@m1ngshum/cosmos-gov-signer-adapter-moca')
const cli = fileURLToPath(new URL('./dist/prepare-vote.js', import.meta.url))
const fixture = JSON.parse(readFileSync(new URL('./synthetic-intent.json', import.meta.url), 'utf8'))

function run(...args) {
  const guard = `
    if (process.permission.has('net')) throw new Error('network unexpectedly allowed')
    const { MocaChainAdapter } = await import(${JSON.stringify(adapterUrl)})
    for (const name of ['fetchActiveProposals', 'signTx', 'broadcastTx']) {
      MocaChainAdapter.prototype[name] = () => { throw new Error(name + ' must remain unused') }
    }
  `
  const result = spawnSync(process.execPath, [
    '--permission', '--allow-fs-read=*',
    '--import', `data:text/javascript,${encodeURIComponent(guard)}`, cli, ...args,
  ], { encoding: 'utf8', env: {} })
  if (result.error) throw result.error
  return result
}

test('prepares a deterministic unsigned authz vote offline', () => {
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  const output = JSON.parse(result.stdout)
  assert.equal(output.source, 'synthetic fixture')
  assert.equal(output.chainId, fixture.chainId)
  assert.equal(output.accountNumber, fixture.accountNumber)
  assert.equal(output.eip712DigestHex, '0x4d3646c3ff85fdfe0f9feafa66e96d2e84acdf68e23b0b171fb1a1220c99b495')
  assert.equal(output.fee.effectivePayer, fixture.delegate)
  assert.deepEqual(Object.keys(output).sort(), [
    'accountNumber', 'chainId', 'cosmosBodyMessagesForHash', 'delegate', 'delegatePublicKeyHex',
    'eip712DigestHex', 'fee', 'granter', 'option', 'proposalId', 'sequence', 'source',
    'unsignedAuthInfoBase64', 'unsignedTxBodyBase64',
  ].sort())

  const body = TxBody.decode(Buffer.from(output.unsignedTxBodyBase64, 'base64'))
  assert.equal(body.memo, '')
  assert.equal(body.timeoutHeight, 0n)
  assert.deepEqual(body.extensionOptions, [])
  assert.deepEqual(body.nonCriticalExtensionOptions, [])
  assert.equal(body.messages.length, 1)
  const [execAny] = body.messages
  assert.equal(execAny.typeUrl, '/cosmos.authz.v1beta1.MsgExec')
  const exec = MsgExec.decode(execAny.value)
  assert.equal(exec.grantee, fixture.delegate)
  assert.equal(exec.msgs.length, 1)
  const [voteAny] = exec.msgs
  assert.equal(voteAny.typeUrl, '/cosmos.gov.v1.MsgVote')
  const vote = MsgVote.decode(voteAny.value)
  assert.deepEqual(vote, {
    proposalId: BigInt(fixture.proposalId),
    voter: fixture.granter,
    option: VoteOption.VOTE_OPTION_NO,
    metadata: '',
  })
  assert.deepEqual(output.cosmosBodyMessagesForHash, [{
    '@type': execAny.typeUrl,
    grantee: exec.grantee,
    msgs: [{
      '@type': voteAny.typeUrl,
      proposal_id: String(vote.proposalId),
      voter: vote.voter,
      option: voteOptionToJSON(vote.option),
      metadata: vote.metadata,
    }],
  }])

  const auth = AuthInfo.decode(Buffer.from(output.unsignedAuthInfoBase64, 'base64'))
  assert.deepEqual(auth.fee, {
    amount: [{ denom: 'amoca', amount: fixture.feeAmount }],
    gasLimit: BigInt(fixture.gasLimit),
    payer: '',
    granter: '',
  })
  assert.equal(auth.signerInfos.length, 1)
  const [signer] = auth.signerInfos
  assert.equal(signer.sequence, BigInt(fixture.sequence))
  assert.equal(signer.modeInfo.single.mode, SignMode.SIGN_MODE_DIRECT)
  assert.equal(signer.publicKey.typeUrl, '/cosmos.crypto.eth.ethsecp256k1.PubKey')
  assert.equal(
    Buffer.from(PubKey.decode(signer.publicKey.value).key).toString('hex'),
    '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
  )
})

test('accepts explicit JSON and rejects invalid intents before emitting evidence', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'prepare-moca-vote-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'intent.json')
  writeFileSync(path, JSON.stringify({ ...fixture, proposalId: '9007199254740991', option: 'YES' }))
  const valid = run(path)
  assert.equal(valid.status, 0, valid.stderr)
  const output = JSON.parse(valid.stdout)
  assert.equal(output.source, 'provided intent')
  const body = TxBody.decode(Buffer.from(output.unsignedTxBodyBase64, 'base64'))
  const exec = MsgExec.decode(body.messages[0].value)
  const vote = MsgVote.decode(exec.msgs[0].value)
  assert.equal(vote.proposalId, 9007199254740991n)
  assert.equal(vote.option, VoteOption.VOTE_OPTION_YES)

  for (const [change, message] of [
    [{ chainId: 'moca_222888-2' }, /chainId/],
    [{ proposalId: '01' }, /proposalId/],
    [{ proposalId: '9007199254740992' }, /proposalId/],
    [{ option: 'UNSPECIFIED' }, /option/],
    [{ granter: fixture.granter.toUpperCase() }, /granter/],
    [{ granter: toBech32('cosmos', new Uint8Array(20)) }, /granter/],
    [{ delegate: fixture.granter }, /must be distinct/],
    [{ delegatePublicKeyHex: '00' }, /64-byte/],
    [{ delegate: toBech32('moca', new Uint8Array(20)) }, /must derive the delegate/],
    [{ accountNumber: 42 }, /accountNumber/],
    [{ sequence: '18446744073709551616' }, /sequence/],
    [{ feeAmount: String(2n ** 256n) }, /feeAmount/],
    [{ gasLimit: '0' }, /gasLimit/],
    [{ endpoint: 'unused' }, /intent must contain exactly/],
  ]) {
    writeFileSync(path, JSON.stringify({ ...fixture, ...change }))
    const invalid = run(path)
    assert.equal(invalid.status, 1, JSON.stringify(change))
    assert.equal(invalid.stdout, '')
    assert.match(invalid.stderr, message)
  }
  writeFileSync(path, '{')
  const invalidJson = run(path)
  assert.equal(invalidJson.status, 1)
  assert.equal(invalidJson.stdout, '')
})
