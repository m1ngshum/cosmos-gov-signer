# @m1ngshum/cosmos-gov-signer-kms

AWS KMS signing and public-key extraction for secp256k1 keys. Converts KMS DER signatures to a 64-byte compact `r || s` value. This package has no Cosmos dependencies.

## Install

```bash
npm install @m1ngshum/cosmos-gov-signer-kms
```

The package exposes ES module imports and TypeScript declarations.

## Public API

| Function | Result |
| --- | --- |
| `signWithKMS(keyId, digest, region)` | `Promise<Uint8Array>`: 64-byte `r || s`, with no recovery byte |
| `getKMSPublicKey(keyId, region)` | `Promise<Uint8Array>`: 64-byte `x || y`, with no `0x04` prefix |
| `decodeDerSignature(der)` | Decode a DER ECDSA signature into 64-byte `r || s` |
| `extractPublicKeyFromSpki(spki)` | Extract the raw public key from a DER SubjectPublicKeyInfo structure |

The two decoding helpers are synchronous and make no AWS requests.

## Example

This function makes AWS requests when called. Supply the key ID or alias, its region, and a transaction digest already computed by the chain adapter.

```typescript
import {
  getKMSPublicKey,
  signWithKMS,
} from '@m1ngshum/cosmos-gov-signer-kms'

export async function signDigest(
  keyId: string,
  region: string,
  digest: Uint8Array,
) {
  const publicKey = await getKMSPublicKey(keyId, region)
  const signature = await signWithKMS(keyId, digest, region)
  return { publicKey, signature }
}
```

## Key and authentication requirements

- Use an asymmetric `ECC_SECG_P256K1` key with key usage `SIGN_VERIFY`.
- The package creates an AWS SDK KMS client using the supplied region and the SDK's default credential resolution. Configure credentials outside application source.
- The calling identity needs `kms:GetPublicKey` and/or `kms:Sign` for the selected key, depending on which function it calls.
- Signing uses `ECDSA_SHA_256` with `MessageType: DIGEST`. The input must be exactly 32 bytes; KMS does not hash it again. See [AWS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html) and [GetPublicKey](https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html).

For MOCA's signing path, use the adapter's EIP-712 digest rather than hashing arbitrary transaction bytes. `MocaChainAdapter.signTx` accepts a `signDigest` callback that can call `signWithKMS`.

This package does not enforce approvals or the core signing gate, normalise signatures to low-S, add an Ethereum recovery byte, build transactions, or broadcast them. The MOCA adapter handles low-S normalisation and recovery when assembling a signed transaction.

Invalid digest length, missing KMS signature/public-key responses, and malformed or noncanonical DER structures throw. AWS permission, credential, and service errors propagate to the caller. The decoders enforce DER structure and lengths; SPKI requires id-ecPublicKey with secp256k1 and a complete uncompressed key. They do not validate elliptic-curve point membership or cryptographic signature validity.
