import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, createPublicKey, ECDH, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx'
import { MsgVote } from 'cosmjs-types/cosmos/gov/v1/tx'
import { VoteOption } from 'cosmjs-types/cosmos/gov/v1/gov'
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys'
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing'
import { AuthInfo, SignDoc, TxBody } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { buildEthermintSignature } from '@m1ngshum/cosmos-gov-signer-adapter-moca'

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../../conformance/fixtures/${name}.json`, import.meta.url), 'utf8'))
}

test('matches the pinned MOCA SDK protobuf, digest, and recovery byte', t => {
  const reference = fixture('moca-vote')
  const { chainRevision, sdkRevision, signatureHex, eip712DigestHex, unsignedAuthInfoBase64, unsignedTxBodyBase64, ...intent } = reference
  const dir = mkdtempSync(join(tmpdir(), 'moca-reference-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'intent.json')
  writeFileSync(file, JSON.stringify(intent))
  const cli = fileURLToPath(new URL('./dist/prepare-vote.js', import.meta.url))
  const result = spawnSync(process.execPath, ['--permission', '--allow-fs-read=*', cli, file], { encoding: 'utf8', env: {} })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.unsignedTxBodyBase64, unsignedTxBodyBase64)
  assert.equal(output.unsignedAuthInfoBase64, unsignedAuthInfoBase64)
  assert.equal(output.eip712DigestHex, eip712DigestHex)
  const signature = Buffer.from(signatureHex, 'hex')
  const recovered = buildEthermintSignature(
    signature.subarray(0, 64),
    Buffer.from(eip712DigestHex.slice(2), 'hex'),
    Buffer.from(intent.delegatePublicKeyHex, 'hex'),
  )
  assert.equal(Buffer.from(recovered).toString('hex'), signatureHex)
})

test('matches the native Cosmos SDK direct sign document and verifies its signature', () => {
  const ref = fixture('cosmos-direct')
  const pubkey = Buffer.from(ref.delegatePublicKeyHex, 'hex')
  const vote = MsgVote.encode(MsgVote.fromPartial({
    voter: ref.granter, proposalId: BigInt(ref.proposalId), option: VoteOption.VOTE_OPTION_NO,
  })).finish()
  const exec = MsgExec.encode(MsgExec.fromPartial({
    grantee: ref.delegate, msgs: [{ typeUrl: '/cosmos.gov.v1.MsgVote', value: vote }],
  })).finish()
  const bodyBytes = TxBody.encode(TxBody.fromPartial({
    messages: [{ typeUrl: '/cosmos.authz.v1beta1.MsgExec', value: exec }],
  })).finish()
  const authInfoBytes = AuthInfo.encode(AuthInfo.fromPartial({
    signerInfos: [{
      publicKey: { typeUrl: '/cosmos.crypto.secp256k1.PubKey', value: PubKey.encode({ key: pubkey }).finish() },
      modeInfo: { single: { mode: SignMode.SIGN_MODE_DIRECT } },
      sequence: BigInt(ref.sequence),
    }],
    fee: { amount: [{ denom: 'uatom', amount: ref.feeAmount }], gasLimit: BigInt(ref.gasLimit) },
  })).finish()
  assert.equal(Buffer.from(bodyBytes).toString('base64'), ref.unsignedTxBodyBase64)
  assert.equal(Buffer.from(authInfoBytes).toString('base64'), ref.unsignedAuthInfoBase64)
  const doc = SignDoc.encode({
    bodyBytes, authInfoBytes, chainId: ref.chainId, accountNumber: BigInt(ref.accountNumber),
  }).finish()
  assert.equal(Buffer.from(doc).toString('base64'), ref.signDocBase64)
  assert.equal(createHash('sha256').update(doc).digest('hex'), ref.sha256Hex)

  const xy = Buffer.from(ECDH.convertKey(pubkey, 'secp256k1', undefined, undefined, 'uncompressed'))
  const key = createPublicKey({
    format: 'jwk', key: {
      kty: 'EC', crv: 'secp256k1', x: xy.subarray(1, 33).toString('base64url'), y: xy.subarray(33).toString('base64url'),
    },
  })
  const signature = Buffer.from(ref.signatureHex, 'hex')
  assert.equal(verify('sha256', doc, { key, dsaEncoding: 'ieee-p1363' }, signature), true)
})
