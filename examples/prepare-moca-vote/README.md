# Prepare a MOCA governance vote offline

From the repository root, use Node.js 26 and pnpm 12 to install the pinned dependencies and build the example.

```sh
pnpm install --frozen-lockfile
pnpm --filter prepare-moca-vote build
pnpm --filter prepare-moca-vote prepare-vote
pnpm --filter prepare-moca-vote test
```

The default run reads [synthetic-intent.json](synthetic-intent.json). It uses public keys from synthetic secp256k1 test points and invented proposal and account details.

To prepare a different intent, copy the fixture and pass the absolute path to your JSON file.

```sh
pnpm --filter prepare-moca-vote prepare-vote /absolute/path/to/intent.json
```

- Use `moca_222888-1` and choose `YES`, `NO`, `ABSTAIN`, or `NO_WITH_VETO`.
- Enter the proposal ID, account number, sequence, fee amount, and gas limit as decimal strings without leading zeros. The proposal ID is a positive JavaScript safe integer. Account number, sequence, and gas limit are uint64 values. Gas limit and the fee amount in `amoca` must be positive, and the fee amount must fit in 256 bits.
- Use distinct, canonical `moca` addresses for the granter and delegate. `delegatePublicKeyHex` is the delegate's secp256k1 public key as 64 bytes of hexadecimal X followed by Y. The CLI checks that the key derives the delegate address.

The output records the input roles and fee, the local EIP-712 digest, and the unsigned `TxBody` and `AuthInfo` separately as Base64. `cosmosBodyMessagesForHash` is the Cosmos JSON passed to the adapter for hashing. The delegate is the effective fee payer when the protobuf fee payer field is empty. The regression test decodes the body and auth info and checks that the nested vote matches the hash input.

The fixture digest is a synthetic local regression value. Live proposal, account, sequence, authz grant, and fee checks are follow-up work. Independent chain digest verification, KMS signing, and broadcast are separate follow-ups.

## Read-only governance preflight

Build the example as above. Save a trusted [Cosmos Chain Registry](https://github.com/cosmos/chain-registry) `chain.json` locally, then select an HTTPS REST endpoint listed in it and the fee denomination configured for that chain.

```sh
pnpm --filter prepare-moca-vote preflight ./chain.json "$REST_URL" "$PROPOSAL_ID" \
  "$GRANTER_ACCOUNT" "$DELEGATE_ACCOUNT" "$FEE_DENOM" "$FEE_AMOUNT"
```

Provide canonical account addresses and a positive proposal ID and fee in base units as decimal strings. The CLI verifies the endpoint's chain ID and recent block time before querying the proposal, the scoped `MsgVote` grant, and the delegate's spendable balance at the same height. Choose an endpoint you trust because the endpoint sees the requested account addresses and supplies the observations. It must support the modern Cosmos SDK REST queries and return the requested height in response metadata.

The report shows the proposal deadline, whether a generic vote grant is present and active, its expiration when set, and whether spendable funds cover the supplied fee. Exit code `0` means these checks passed, `2` means an observed condition failed, and `1` means the inputs or query results could not be validated. Custom authorizations are reported as unsupported. A passing snapshot does not predict final gas fees or guarantee inclusion.

See the [Go reference fixtures](../../conformance/README.md) for the independent signing checks.
