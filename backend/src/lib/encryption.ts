/**
 * AES-256-GCM file encryption
 * Each file gets a unique DEK (data encryption key).
 * The DEK is encrypted with the master key and stored as the encryptionKeyRef.
 * Files are never served directly by Nginx — always through the auth+decrypt layer.
 */
import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

function getMasterKey(): Buffer {
  return Buffer.from(config.ENCRYPTION_MASTER_KEY, 'hex');
}

/** Generate a new per-file DEK, encrypt it with the master key, return as base64 */
export function generateEncryptedDek(): { dek: Buffer; encryptedDek: string } {
  const dek = crypto.randomBytes(KEY_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(16) + tag(16) + ciphertext(32) = 64 bytes → 88 base64 chars
  const encryptedDek = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return { dek, encryptedDek };
}

/** Recover the DEK from the stored encryptedDek */
function decryptDek(encryptedDek: string): Buffer {
  const buf = Buffer.from(encryptedDek, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypt a file buffer. Returns the encrypted buffer ready for storage. */
export function encryptFile(
  plaintext: Buffer,
  encryptedDek: string
): Buffer {
  const dek = decryptDek(encryptedDek);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Prepend iv + tag so we can decrypt without separate storage
  return Buffer.concat([iv, tag, encrypted]);
}

/** Decrypt a stored file buffer. Returns plaintext. */
export function decryptFile(
  ciphertext: Buffer,
  encryptedDek: string
): Buffer {
  const dek = decryptDek(encryptedDek);
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const tag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = ciphertext.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
