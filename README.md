# cosmos-gov-signer

Reusable library for Cosmos SDK governance signing with AWS KMS. Designed for chains where native multisig is unavailable (e.g. `ethsecp256k1` chains like MOCA/Evmos).

## Architecture

Three-wallet design with blast radius isolation:

```
Validator Operator Key (cold)
  ├── authz grant (one-time) ──► Vote-Only Wallet (KMS)
  │                                 └── Signs MsgVote via MsgExec
  │
  └── (no relationship) ──────► Proposal Wallet (KMS)
                                    └── Signs MsgSubmitProposal directly
```

**Default behavior:** auto-votes NO on every new governance proposal. Approvers can override within a configurable window before the vote is signed and broadcast.

## Packages

```
packages/
├── core/              Zero-dep types, interfaces, signing gate logic
├── kms/               AWS KMS signing + DER decoding
├── adapters/
│   └── moca/          MOCA chain adapter (ethsecp256k1, cosmjs)
└── poller/            Stateless governance proposal poller
```

| Package | Description | Dependencies |
|---------|-------------|-------------|
| `@cosmos-gov-signer/core` | Types, `ChainAdapter` interface, `evaluateSigningGate` | None |
| `@cosmos-gov-signer/kms` | `signWithKMS`, `getKMSPublicKey`, DER decoding | `@aws-sdk/client-kms` |
| `@cosmos-gov-signer/adapter-moca` | `MocaChainAdapter` implementation | `core`, cosmjs, `@noble/hashes` |
| `@cosmos-gov-signer/poller` | `pollProposals` function | `core` |

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

Requires Node.js >= 20 and pnpm >= 9.

## Signing Gate

All signing operations pass through `evaluateSigningGate` before any KMS call:

1. Record status is `ready` (K-of-N threshold met)
2. Auto-vote: override window expired + still `scheduled`
3. Rejects if voting period has passed
4. Rejects if already signed (idempotency)

## License

MIT
