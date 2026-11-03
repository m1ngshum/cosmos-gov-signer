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

## npm releases

CI builds, typechecks, tests, and packs all four packages on pull requests and
pushes to `main`. pnpm packs the packages so their `workspace:*` dependencies
are converted to npm versions.

Before the first release, confirm you control the `@cosmos-gov-signer` npm scope.
npm Trusted Publishing is configured on existing packages, so bootstrap any
missing packages once using an authorized npm account. Build and pack the
reviewed release using the workflow's pack step, then publish the resulting
tarballs with `npm publish <tarball> --access public --ignore-scripts` in this
order: core, kms, poller, adapter-moca.

Before configuring npm, create the GitHub environment `npm-publish` and restrict
its deployment branches to the branch `main` only (no tags). For each package, add a [GitHub Actions trusted publisher](https://docs.npmjs.com/trusted-publishers/)
with owner `m1ngshum`, repository `cosmos-gov-signer`, workflow
`npm-publish.yml`, environment `npm-publish`, and permission for direct `npm publish`.
After bootstrapping, bump the versions of all four packages together, merge
the release changes, and run **npm release** manually from `main`. The publish
job uses OIDC and needs no npm token secret. Configure trust when ready to
publish: npm expires the initial configuration if no successful publish occurs
within two days. Publishing is sequential: if a run
fails after any package goes live, check the registry before retrying. npm
versions cannot be overwritten.

## License

MIT
