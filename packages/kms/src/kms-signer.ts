import {
  KMSClient,
  SignCommand,
  GetPublicKeyCommand,
} from '@aws-sdk/client-kms'
import { decodeDerSignature, extractPublicKeyFromSpki } from './der.js'

/**
 * Sign a pre-hashed message digest using AWS KMS.
 *
 * @param keyId - KMS key ID or alias ARN
 * @param msgHash - 32-byte message digest (pre-hashed by caller)
 * @param region - AWS region where the KMS key lives
 * @returns 64-byte compact signature (r || s), no recovery byte
 */
export async function signWithKMS(
  keyId: string,
  msgHash: Uint8Array,
  region: string,
): Promise<Uint8Array> {
  const client = new KMSClient({ region })

  const response = await client.send(
    new SignCommand({
      KeyId: keyId,
      Message: msgHash,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    }),
  )

  if (response.Signature === undefined) {
    throw new Error('KMS Sign returned empty signature')
  }

  return decodeDerSignature(new Uint8Array(response.Signature))
}

/**
 * Retrieve the raw uncompressed public key (64 bytes) from a KMS key.
 *
 * @param keyId - KMS key ID or alias ARN
 * @param region - AWS region where the KMS key lives
 * @returns 64-byte uncompressed public key (x || y, no 0x04 prefix)
 */
export async function getKMSPublicKey(
  keyId: string,
  region: string,
): Promise<Uint8Array> {
  const client = new KMSClient({ region })

  const response = await client.send(
    new GetPublicKeyCommand({ KeyId: keyId }),
  )

  if (response.PublicKey === undefined) {
    throw new Error('KMS GetPublicKey returned empty key')
  }

  return extractPublicKeyFromSpki(new Uint8Array(response.PublicKey))
}
