# Governance signing conformance

These fixtures let wallet and SDK maintainers compare their bytes with two independent Go references. The inputs use public deterministic test keys, invented account state, and a delegated `MsgExec` → `MsgVote`. Never fund the fixture addresses or submit the test data.

| Fixture | Source | What the tests compare |
| --- | --- | --- |
| [MOCA EIP-712](fixtures/moca-vote.json) | [MOCA v1.5.0 chain revision](https://github.com/mocachain/moca/tree/c88fa7c6bb0659c4f81a454586e23aa2f7245f8a) and its [pinned SDK revision](https://github.com/mocachain/moca-cosmos-sdk/tree/af93a95df6d153c6ffe7dd4b1e8672bd405af566) | `TxBody`, `AuthInfo`, EIP-712 digest, and 65-byte recoverable signature format |
| [Cosmos SDK direct](fixtures/cosmos-direct.json) | [Cosmos SDK v0.55.1](https://github.com/cosmos/cosmos-sdk/releases/tag/v0.55.1), revision `bb3fb62963674e6c423e33fcec7029b79f182982` | `TxBody`, `AuthInfo`, protobuf `SignDoc`, SHA-256 digest, and 64-byte compact signature |

Reference revisions and dependency manifests were checked on November 20, 2026. MOCA uses the SDK fork already pinned by its stable chain release. The Go programs verify their signatures and reject a different signer. The TypeScript test invokes the published MOCA adapter through the example CLI, compares the bytes and digest, and compares the recovery byte. The native test independently constructs the direct sign document using the workspace's existing protobuf SDK and verifies the Go signature with Node crypto.

To rerun the independent Go references from the repository root, use Go 1.27.1, a C compiler for the pinned MOCA crypto dependency, Bash, curl, and shasum:

```sh
bash conformance/regenerate.sh
```

The script uses temporary Go modules and checksum-pinned upstream manifests. It downloads public dependencies as needed and compares the regenerated JSON with the checked-in fixtures. The generators run against local synthetic data. To run the offline checks used by CI after installing the lockfile:

```sh
pnpm --filter prepare-moca-vote build
pnpm --filter prepare-moca-vote test
```

These are reference vectors for the named source revisions. Live chain acceptance, authorization grants, metadata escaping in proposal submissions, and other signing modes need separate coverage.
