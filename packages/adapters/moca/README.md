# @m1ngshum/cosmos-gov-signer-adapter-moca

A `ChainAdapter` implementation for MOCA's `ethsecp256k1` signing path, with fixed chain ID `moca_222888-1`, address prefix `moca`, and fee denomination `amoca` in the proposal builder.

## Install

```bash
npm install @m1ngshum/cosmos-gov-signer-adapter-moca
```

The package exposes ES module imports and TypeScript declarations. Endpoints must be supplied by the application. The adapter does not discover the network or verify that an endpoint matches its fixed chain ID.

## Public API

- `MocaChainAdapter` and type `MocaAdapterConfig`.
- `deriveAddress(publicKey64, prefix)`: derive a bech32 address from a raw 64-byte `x || y` public key.
- Signing helpers: `computeMocaEip712Digest`, `buildTxParts`, `assembleTxRaw`, `compressEcPubkey`, and `buildEthermintSignature`.
- Signing types: `BuildEnvelopeInput`, `EnvelopeParts`, `ComputeDigestInput`, `CosmosMsgJson`, and `TypedDataMessageInput`.

`toProtoVoteOption` and `TYPE_URLS` are internal helpers and are not public package exports.

## Prepare an unsigned vote

`buildVoteTx` returns encoded `MsgExec` message bytes wrapping a `MsgVote`. These are not a signed transaction and cannot be passed directly to `broadcastTx`.

```typescript
import {
  MocaChainAdapter,
  type CosmosMsgJson,
} from '@m1ngshum/cosmos-gov-signer-adapter-moca'

export async function prepareNoVote(
  rpcEndpoint: string,
  lcdEndpoint: string,
  proposalId: number,
  grantee: string,
  granter: string,
) {
  const adapter = new MocaChainAdapter({ rpcEndpoint, lcdEndpoint })
  const value = await adapter.buildVoteTx(proposalId, 'NO', grantee, granter)
  const bodyMessages: CosmosMsgJson[] = [{
    '@type': '/cosmos.authz.v1beta1.MsgExec',
    grantee,
    msgs: [{
      '@type': '/cosmos.gov.v1.MsgVote',
      proposal_id: String(proposalId),
      voter: granter,
      option: 'VOTE_OPTION_NO',
      metadata: '',
    }],
  }]

  return {
    adapter,
    innerMsg: { typeUrl: '/cosmos.authz.v1beta1.MsgExec', value },
    bodyMessages,
  }
}
```

The third builder argument is the signing wallet/authz grantee. The fourth is the granter whose vote is cast. A suitable on-chain authz grant must already exist. Pass account addresses, not validator operator (`valoper`) addresses.

## Sign and broadcast

`adapter.signTx(input)` computes the MOCA EIP-712 digest, calls the supplied signer, normalises low-S, derives the recovery bit, and returns encoded `TxRaw` bytes. Supply:

| Input | Meaning |
| --- | --- |
| `innerMsg` | One protobuf message, including its type URL, such as the `MsgExec` above |
| `bodyMessages` | JSON descriptions of the same message, including matching addresses, vote option, and proposal ID |
| `signerPubkey` | Raw 64-byte `x || y` public key, without `0x04` |
| `signerAddressHex` | The signer's Ethereum-style 20-byte `0x` address, used for fee-payer hashing; exactly 20 bytes of hex are required |
| `accountNumber`, `sequence` | Current signer account values as `bigint` |
| `chainId` | The actual target Cosmos chain ID; it must match the intended network |
| `fee` | `{ denom, amount, gasLimit }`, with string amount and bigint gas limit |
| `memo` | Optional transaction memo |
| `signDigest` | Async callback from a 32-byte digest to a 64-byte compact `r || s` signature |

The protobuf bytes and JSON are provided separately and are not cross-checked for semantic equality. Use the same approved transaction data to construct both. A mismatched signature/public key/digest is rejected during recovery.

To use AWS KMS, install `@m1ngshum/cosmos-gov-signer-kms` and provide `signDigest: digest => signWithKMS(keyId, digest, region)` using an authorised key. The raw public key from `getKMSPublicKey` has the required format. Hashing is already handled by `signTx`; do not hash the callback's digest again.

Approvals, the core signing gate, atomic signing claims, sequence coordination, and durable transaction tracking are caller responsibilities. The adapter neither enforces the gate nor fetches account numbers, sequences, or fee estimates.

Call `broadcastTx(signedTxBytes)` only after authorising submission. It uses `broadcast_tx_sync` and returns a hash when the RPC accepts the transaction. It does not wait for block inclusion or verify execution or the recorded governance vote. The caller must query the chain and reconcile the outcome before treating the vote as successful.

## Other operations

- `fetchActiveProposals()` queries the LCD gov v1 voting-period endpoint. It validates proposal IDs as safe JavaScript integers, voting dates, and status values. It follows LCD continuation keys and rejects repeated or malformed keys; a failed page rejects the whole fetch.
- `buildSubmitProposalTx(content, depositAmount, proposer)` returns unsigned `MsgSubmitProposal` bytes for type URL `/cosmos.gov.v1.MsgSubmitProposal`. It includes title, summary, metadata, proposer, and an initial deposit in `amoca`. It does not populate executable proposal messages; the `content.type` field is not used.

For the current submission builder, supply metadata so the proposal is not empty:

```typescript
export async function prepareTextProposal(
  adapter: MocaChainAdapter,
  proposer: string,
  metadata: string,
) {
  const value = await adapter.buildSubmitProposalTx(
    { title: 'Example proposal', summary: 'Example summary', type: 'text', metadata },
    '1000000',
    proposer,
  )
  return { typeUrl: '/cosmos.gov.v1.MsgSubmitProposal', value }
}
```

This block uses the `MocaChainAdapter` import from the vote example. The deposit is illustrative; check the target chain's requirements before signing.

Address derivation is `keccak256(publicKey64) → last 20 bytes → bech32`. The exported `deriveAddress` accepts `Uint8Array` plus a prefix; the instance method `adapter.deriveAddress` accepts a Node `Buffer` and uses `moca`.

LCD/RPC HTTP failures, malformed responses, rejected broadcasts, and signing failures throw. Handle them in the consuming application. Published-package checks have covered types and mocked signing/RPC; live KMS and chain acceptance remain unverified.
