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

**Example integration policy:** A consuming application can schedule a NO vote for each new governance proposal and let approvers override it before signing. The poller only calls the application back for active proposals; the application handles scheduling, approvals, signing, and broadcasting.

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
| `@m1ngshum/cosmos-gov-signer-core` | Types, `ChainAdapter` interface, `evaluateSigningGate` | None |
| `@m1ngshum/cosmos-gov-signer-kms` | `signWithKMS`, `getKMSPublicKey`, DER decoding | `@aws-sdk/client-kms` |
| `@m1ngshum/cosmos-gov-signer-adapter-moca` | `MocaChainAdapter` implementation | `core`, cosmjs, `@noble/hashes` |
| `@m1ngshum/cosmos-gov-signer-poller` | `pollProposals` function | `core` |

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

Use Node.js 24 and pnpm 10 for local development, matching CI.

## Signing Gate

Call `evaluateSigningGate` before requesting a KMS signature. The signing
APIs do not call the gate themselves. The application must validate approvals
before setting a record to `ready`; the gate does not count approvals.

The gate rejects records whose voting period has passed or that already have
a transaction hash. It then allows `ready` records and scheduled auto-votes
whose override window has passed. All other records are rejected.

## npm releases

CI builds, typechecks, tests, and packs all four packages on pull requests and
pushes to `main`. pnpm packs the packages so their `workspace:*` dependencies
are converted to npm versions.

Before the first release, sign in to npm as `m1ngshum` and verify with `npm whoami`.
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
within two days.

If a publish run fails, use `npm view <package>@<version> version` against the
public registry to confirm which versions landed. Once any package is live,
rerunning the workflow will stop at the first already published version.
Download the `npm-packages` artifact from the failed run and, after resolving
the failure, use an authorized npm account to publish only the missing,
reviewed tarballs in the order above. If those exact tarballs cannot be
verified or need changes, prepare a new coordinated version for all four
packages. Published versions cannot be overwritten.

## License

MIT
