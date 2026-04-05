# @cosmos-gov-signer/kms

AWS KMS signing and public key extraction for secp256k1 keys. Converts KMS DER-encoded responses to the 64-byte compact format expected by Cosmos chains.

Zero Cosmos dependencies — this package only knows about KMS and raw bytes.

## Exports

### Functions

- `signWithKMS(keyId, msgHash, region)` — Sign a pre-hashed 32-byte digest. Returns 64-byte compact `r || s`.
- `getKMSPublicKey(keyId, region)` — Get raw 64-byte uncompressed public key (no `0x04` prefix).
- `decodeDerSignature(der)` — Convert DER-encoded ECDSA signature to 64-byte compact format.
- `extractPublicKeyFromSpki(spki)` — Extract raw public key from DER-encoded SubjectPublicKeyInfo.

## Usage

```typescript
import { signWithKMS, getKMSPublicKey } from '@cosmos-gov-signer/kms'

// Get the public key
const pubkey = await getKMSPublicKey('alias/gov-vote-key', 'ap-southeast-1')

// Sign a pre-hashed message (caller must hash with keccak256 for ethsecp256k1)
const signature = await signWithKMS('alias/gov-vote-key', msgHash, 'ap-southeast-1')
// signature is 64 bytes: r(32) || s(32)
```

## KMS Key Configuration

- Key spec: `ECC_SECG_P256K1` (secp256k1)
- Signing algorithm: `ECDSA_SHA_256`
- Message type: `DIGEST` (pre-hashed input, KMS does not re-hash)
