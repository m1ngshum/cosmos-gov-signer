# cosmos-gov-signer

TypeScript ES module libraries for Cosmos governance signing with AWS KMS and a MOCA `ethsecp256k1` adapter. The packages provide signing utilities; the consuming application owns approvals, scheduling, persistence, key permissions, and transaction reconciliation.

## Status and roadmap

As checked on 15 November 2026, all four npm packages report `0.1.3`. That release was published from `2d7b96c` by [Actions run 42758382717](https://github.com/m1ngshum/cosmos-gov-signer/actions/runs/42758382717).

[PR #39](https://github.com/m1ngshum/cosmos-gov-signer/pull/39) subsequently added invalid-date rejection, stricter DER/SPKI and signer-hex validation, and LCD pagination. Those fixes are merged on `main` and [passed build, typecheck, 103 tests, and packaging](https://github.com/m1ngshum/cosmos-gov-signer/actions/runs/43146303875), but have not been published to npm. Source version numbers alone do not establish which changes reached the registry.

The previously verified `0.1.2` release passed a clean npm install, mocked integrations, and signature/provenance verification. Live AWS KMS and chain acceptance remain unverified.

- [Roadmap and acceptance criteria](docs/roadmap.md)
- [Private delivery board](https://github.com/users/m1ngshum/projects/6) — owner access required; public roadmap summaries live in this repository.
- [Reference integration architecture](docs/architecture.md)

A roadmap entry does not authorize a merge, release, provider request, signing operation, or broadcast.

## Packages

| Package | Purpose | API guide |
| --- | --- | --- |
| [@m1ngshum/cosmos-gov-signer-core](https://www.npmjs.com/package/@m1ngshum/cosmos-gov-signer-core) | Types, adapter contract, pure signing gate; no runtime dependencies | [core](packages/core/README.md) |
| [@m1ngshum/cosmos-gov-signer-kms](https://www.npmjs.com/package/@m1ngshum/cosmos-gov-signer-kms) | KMS signing and DER/public-key conversion | [kms](packages/kms/README.md) |
| [@m1ngshum/cosmos-gov-signer-adapter-moca](https://www.npmjs.com/package/@m1ngshum/cosmos-gov-signer-adapter-moca) | Proposal discovery, unsigned messages, EIP-712 signing, synchronous broadcast | [adapter-moca](packages/adapters/moca/README.md) |
| [@m1ngshum/cosmos-gov-signer-poller](https://www.npmjs.com/package/@m1ngshum/cosmos-gov-signer-poller) | Single-pass callback-based proposal polling | [poller](packages/poller/README.md) |

## Development

Use Node.js 26 and pnpm 12, matching CI. See `.github/workflows/npm-publish.yml` for the pinned tool versions.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

## Signing responsibilities

Call `evaluateSigningGate` before requesting a signature. It trusts a record marked `ready`; it does not count approvals or lock records. The KMS and adapter signing APIs do not invoke it automatically. The application must validate approvals, atomically claim signing work, coordinate account sequences, and persist/reconcile outcomes.

The reference three-wallet design separates a cold authority key, a vote delegate, and a proposal wallet. It is an application design, not a deployed service or an on-chain multisig implementation. Fee funding, authz grant lifecycle, and key-policy enforcement need explicit operational design.

## Releases

PRs and pushes to `main` build, typecheck, test, and pack all four packages. pnpm converts `workspace:*` dependencies to npm versions when packing.

For a coordinated release:

1. Review the source changes and bump all four package versions together.
2. Merge only after the required checks and an authorized review/override.
3. With explicit release authorization, run **npm release** manually from `main`.
4. Verify all four exact versions, public tarball downloads, provenance identities/digests, and a fresh consumer install. Run `npm audit signatures` in that consumer.

The isolated publish job uses npm Trusted Publishing (OIDC), not a stored npm publishing token. Each package's trust must match owner `m1ngshum`, repository `cosmos-gov-signer`, workflow `npm-publish.yml`, and environment `npm-publish`. The environment must restrict deployment branches to `main`, excluding tags. A new trust binding must complete its first successful publish within two days; see [npm's configuration guidance](https://docs.npmjs.com/trusted-publishers/).

### Failure and partial release recovery

Check exact versions with `npm view <package>@<version> version`, then check their metadata-provided tarball and attestation URLs. Registry metadata and artifacts can become visible at different times. A 404 after a successful publish is not permission to republish or overwrite that version.

If some versions genuinely did not publish, rerunning the workflow will stop at the first already-published package. Download the failed run's `npm-packages` artifact, verify its identity and contents, resolve the failure, and obtain explicit authorization to publish only the missing reviewed tarballs. Alternatively, prepare a fresh coordinated version if changes or unverifiable artifacts require it. Publish order is core, kms, poller, adapter-moca. Published versions cannot be overwritten.

The four existing packages have already been bootstrapped. Creating any additional package requires control of its npm scope and an authorized initial publish before configuring its trust.

## License

MIT

## Contact

For general enquiries, contact [hello@m1ngshum.com](mailto:hello@m1ngshum.com).
