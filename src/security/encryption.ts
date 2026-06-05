/**
 * Bozzoo BTC Wallet — AES-256-GCM Encryption Module (TypeScript)
 *
 * Uses the browser's native Web Crypto API exclusively.
 * Zero external cryptography dependencies.
 *
 * Security parameters:
 *   Key derivation : PBKDF2-SHA256, 310,000 iterations (NIST SP 800-63B 2023)
 *   Encryption     : AES-256-GCM (authenticated, 128-bit auth tag)
 *   Salt           : 256-bit random (per-encryption, never reused)
 *   IV             : 96-bit random (per-encryption, never reused)
 *
 * Wire format (base64):
 *   [ salt: 32 bytes | iv: 12 bytes | ciphertext + auth-tag: variable ]
 */

//  Constants 

const PBKDF2_ITERATIONS: number = 310_000;
const SALT_BYTE_LENGTH:  number = 32;   // 256-bit salt
const IV_BYTE_LENGTH:    number = 12;   // 96-bit IV (GCM recommended)
const AES_KEY_BITS:      number = 256;  // AES-256

//  Type Definitions 

/** Result of a successful encryption operation */
export interface EncryptedBlob {
  /** Base64-encoded ciphertext (salt || iv || ciphertext) */
  data: string;
  /** ISO timestamp of when the data was encrypted */
  encryptedAt: string;
}

/** Structured error for decryption failures */
export class CryptoError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name  = 'CryptoError';
    this.code  = code;
    Object.setPrototypeOf(this, CryptoError.prototype);
  }
}

//  Internal Helpers 

/**
 * Derives an AES-256-GCM CryptoKey from a user password + salt using PBKDF2.
 *
 * @internal
 * @param password - User's plaintext password
 * @param salt     - Random per-encryption salt bytes
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  if (!password || password.length === 0) {
    throw new CryptoError('EMPTY_PASSWORD', 'Password must not be empty.');
  }

  const encoder = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,              // not extractable
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash:       'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,              // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encodes a Uint8Array to a base64 string.
 * @internal
 */
function toBase64(bytes: Uint8Array): string {
  // Chunked approach to avoid stack overflow with spread operator on large arrays
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string to a Uint8Array.
 * @internal
 */
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

//  Public API 

/**
 * Encrypts a plaintext string using AES-256-GCM with PBKDF2 key derivation.
 *
 * The returned EncryptedBlob contains a base64 string encoding:
 *   salt(32) || iv(12) || ciphertext+auth-tag(variable)
 *
 * A fresh random salt and IV are generated for every call, so encrypting
 * the same plaintext twice will always produce different ciphertext.
 *
 * @param plaintext - Data to encrypt (e.g., BIP-39 seed phrase)
 * @param password  - User's wallet password
 * @returns         EncryptedBlob with base64-encoded ciphertext and timestamp
 *
 * @throws {CryptoError} EMPTY_PASSWORD  — if password is empty
 * @throws {CryptoError} ENCRYPT_FAILED  — if the Web Crypto API call fails
 */
export async function encrypt(
  plaintext: string,
  password:  string
): Promise<EncryptedBlob> {
  if (!plaintext) {
    throw new CryptoError('EMPTY_PLAINTEXT', 'Plaintext must not be empty.');
  }

  const encoder = new TextEncoder();
  const salt    = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv      = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  let cipherBuffer: ArrayBuffer;

  try {
    const key = await deriveKey(password, salt);
    cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    );
  } catch (err) {
    if (err instanceof CryptoError) throw err;
    throw new CryptoError(
      'ENCRYPT_FAILED',
      `Encryption failed: ${(err as Error).message}`
    );
  }

  // Combine: salt || iv || ciphertext
  const cipherBytes = new Uint8Array(cipherBuffer);
  const combined    = new Uint8Array(
    SALT_BYTE_LENGTH + IV_BYTE_LENGTH + cipherBytes.byteLength
  );
  combined.set(salt,        0);
  combined.set(iv,          SALT_BYTE_LENGTH);
  combined.set(cipherBytes, SALT_BYTE_LENGTH + IV_BYTE_LENGTH);

  return {
    data:        toBase64(combined),
    encryptedAt: new Date().toISOString(),
  };
}

/**
 * Decrypts an EncryptedBlob produced by {@link encrypt}.
 *
 * @param blob     - The EncryptedBlob (or its raw base64 data string)
 * @param password - User's wallet password
 * @returns          Decrypted plaintext string
 *
 * @throws {CryptoError} INVALID_BLOB      — if the blob is malformed
 * @throws {CryptoError} WRONG_PASSWORD    — if decryption fails (wrong password or tampered data)
 */
export async function decrypt(
  blob:     EncryptedBlob | string,
  password: string
): Promise<string> {
  const b64Data = typeof blob === 'string' ? blob : blob.data;

  let combined: Uint8Array;
  try {
    combined = fromBase64(b64Data);
  } catch {
    throw new CryptoError('INVALID_BLOB', 'The encrypted data is not valid base64.');
  }

  const minLength = SALT_BYTE_LENGTH + IV_BYTE_LENGTH + 16; // 16 = GCM auth tag
  if (combined.byteLength < minLength) {
    throw new CryptoError(
      'INVALID_BLOB',
      `Encrypted data is too short (${combined.byteLength} bytes, minimum ${minLength}).`
    );
  }

  const salt       = combined.slice(0, SALT_BYTE_LENGTH);
  const iv         = combined.slice(SALT_BYTE_LENGTH, SALT_BYTE_LENGTH + IV_BYTE_LENGTH);
  const ciphertext = combined.slice(SALT_BYTE_LENGTH + IV_BYTE_LENGTH);

  try {
    const key         = await deriveKey(password, salt);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(plainBuffer);
  } catch (err) {
    if (err instanceof CryptoError) throw err;
    // AES-GCM auth tag mismatch = wrong password or tampered data
    throw new CryptoError(
      'WRONG_PASSWORD',
      'Decryption failed. The password is incorrect or the data has been tampered with.'
    );
  }
}

/**
 * Verifies a password by attempting decryption.
 * Returns true if the password is correct, false otherwise.
 * Never throws — safe to use in UI validation loops.
 *
 * @param blob     - The EncryptedBlob to verify against
 * @param password - Password to test
 */
export async function verifyPassword(
  blob:     EncryptedBlob | string,
  password: string
): Promise<boolean> {
  try {
    await decrypt(blob, password);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates password strength against minimum security requirements.
 *
 * Rules:
 *   - At least 8 characters
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one digit
 *   - At least one special character
 *
 * @param password - Password to validate
 * @returns Object with `valid` flag and `errors` array
 */
export function validatePasswordStrength(password: string): {
  valid:  boolean;
  score:  number;     // 0-4 (0=weak, 4=strong)
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8)      errors.push('At least 8 characters required.');
  if (!/[A-Z]/.test(password))  errors.push('At least one uppercase letter required.');
  if (!/[a-z]/.test(password))  errors.push('At least one lowercase letter required.');
  if (!/[0-9]/.test(password))  errors.push('At least one digit required.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('At least one special character required.');

  const score = Math.max(0, 4 - errors.length);

  return {
    valid: errors.length === 0,
    score,
    errors,
  };
}

/**
 * Generates a cryptographically secure random string for use as a nonce
 * or session token. Uses crypto.getRandomValues for true randomness.
 *
 * @param byteLength - Number of random bytes (default: 32)
 * @returns Hex-encoded random string
 */
export function generateSecureToken(byteLength: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
