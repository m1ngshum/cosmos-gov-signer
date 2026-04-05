# @cosmos-gov-signer/adapter-moca

ChainAdapter implementation for MOCA chain (`moca_222888-1`), an Evmos v12 fork using `ethsecp256k1`.

## Exports

- `MocaChainAdapter` — Implements `ChainAdapter` from `@cosmos-gov-signer/core`
- `deriveAddress(pubkey, prefix)` — Derive bech32 address from ethsecp256k1 public key
- `toProtoVoteOption(option)` — Map string vote options to protobuf enum values
- `TYPE_URLS` — Protobuf type URLs for gov v1 and authz messages

## Usage

```typescript
import { MocaChainAdapter } from '@cosmos-gov-signer/adapter-moca'

const adapter = new MocaChainAdapter({
  rpcEndpoint: process.env.MOCA_RPC_ENDPOINT,
  lcdEndpoint: process.env.MOCA_LCD_ENDPOINT,
})

// Fetch active proposals
const proposals = await adapter.fetchActiveProposals()

// Build a vote transaction (authz exec pattern)
const txBytes = await adapter.buildVoteTx(
  42,                    // proposalId
  'NO',                  // vote option
  'moca1grantee...',     // voter (vote-only wallet, authz grantee)
  'moca1granter...',     // granter (validator operator address)
)

// Build a proposal submission transaction
const submitBytes = await adapter.buildSubmitProposalTx(
  { title: 'My Proposal', summary: '...', type: 'text' },
  '1000000',             // deposit amount in amoca
  'moca1proposer...',    // proposer address
)
```

## Address Derivation

MOCA uses Ethereum-style address derivation: `keccak256(uncompressed_pubkey) → last 20 bytes → bech32('moca', ...)`.

```typescript
import { deriveAddress } from '@cosmos-gov-signer/adapter-moca'

const address = deriveAddress(pubkey64Bytes, 'moca')
// → 'moca1...'
```
