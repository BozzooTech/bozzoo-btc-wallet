/**
 * Bozzoo BTC Wallet - Security Crypto Module Tests
 *
 * Tests for AES-256-GCM encryption/decryption, password validation,
 * and secure token generation.
 */

import {
  encrypt,
  decrypt,
  verifyPassword,
  validatePasswordStrength,
  generateSecureToken,
  CryptoError,
} from '../../src/security/encryption';

describe('security/crypto', () => {

  //  Encrypt / Decrypt Round-Trip 

  describe('encrypt() + decrypt()', () => {
    it('should round-trip a plaintext string', async () => {
      const plaintext = 'abandon ability able about above absent';
      const password = 'StrongP@ss1';

      const blob = await encrypt(plaintext, password);
      expect(blob).toHaveProperty('data');
      expect(blob).toHaveProperty('encryptedAt');
      expect(typeof blob.data).toBe('string');

      const decrypted = await decrypt(blob, password);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext on each call (random salt/IV)', async () => {
      const plaintext = 'test phrase';
      const password = 'P@ssw0rd!';

      const blob1 = await encrypt(plaintext, password);
      const blob2 = await encrypt(plaintext, password);

      expect(blob1.data).not.toBe(blob2.data);
    });

    it('should handle long plaintext (stress test for toBase64 fix)', async () => {
      const longText = 'a'.repeat(100_000);
      const password = 'P@ssw0rd!';

      const blob = await encrypt(longText, password);
      const decrypted = await decrypt(blob, password);
      expect(decrypted).toBe(longText);
    });

    it('should handle unicode plaintext', async () => {
      const plaintext = '🔐 Bitcoin σε μυστική φράση 你好世界';
      const password = 'Un1c0de_P@ss!';

      const blob = await encrypt(plaintext, password);
      const decrypted = await decrypt(blob, password);
      expect(decrypted).toBe(plaintext);
    });
  });

  //  Decryption Failures 

  describe('decrypt() error cases', () => {
    it('should reject wrong password with WRONG_PASSWORD error', async () => {
      const blob = await encrypt('secret', 'CorrectP@ss1');

      await expect(decrypt(blob, 'WrongP@ss1'))
        .rejects.toThrow(CryptoError);

      try {
        await decrypt(blob, 'WrongP@ss1');
      } catch (err) {
        expect(err).toBeInstanceOf(CryptoError);
        expect((err as CryptoError).code).toBe('WRONG_PASSWORD');
      }
    });

    it('should reject invalid base64 with INVALID_BLOB error', async () => {
      await expect(decrypt('!!!not-base64!!!', 'pass'))
        .rejects.toThrow(CryptoError);

      try {
        await decrypt('!!!not-base64!!!', 'pass');
      } catch (err) {
        expect((err as CryptoError).code).toBe('INVALID_BLOB');
      }
    });

    it('should reject truncated ciphertext with INVALID_BLOB error', async () => {
      // Too short to contain salt + iv + auth tag
      const shortBlob = Buffer.from(new Uint8Array(10)).toString('base64');

      await expect(decrypt(shortBlob, 'pass'))
        .rejects.toThrow(CryptoError);

      try {
        await decrypt(shortBlob, 'pass');
      } catch (err) {
        expect((err as CryptoError).code).toBe('INVALID_BLOB');
      }
    });

    it('should detect tampered ciphertext (auth tag failure)', async () => {
      const blob = await encrypt('sensitive data', 'P@ssw0rd!');

      // Tamper with the ciphertext
      const decoded = Buffer.from(blob.data, 'base64');
      decoded[decoded.length - 1] ^= 0xff; // flip last byte (auth tag)
      const tampered = decoded.toString('base64');

      await expect(decrypt(tampered, 'P@ssw0rd!'))
        .rejects.toThrow(CryptoError);
    });
  });

  //  Input Validation 

  describe('encrypt() input validation', () => {
    it('should reject empty password', async () => {
      await expect(encrypt('data', ''))
        .rejects.toThrow(CryptoError);

      try {
        await encrypt('data', '');
      } catch (err) {
        expect((err as CryptoError).code).toBe('EMPTY_PASSWORD');
      }
    });

    it('should reject empty plaintext', async () => {
      await expect(encrypt('', 'P@ssw0rd!'))
        .rejects.toThrow(CryptoError);

      try {
        await encrypt('', 'P@ssw0rd!');
      } catch (err) {
        expect((err as CryptoError).code).toBe('EMPTY_PLAINTEXT');
      }
    });
  });

  //  verifyPassword 

  describe('verifyPassword()', () => {
    it('should return true for correct password', async () => {
      const blob = await encrypt('data', 'MyP@ss1!');
      expect(await verifyPassword(blob, 'MyP@ss1!')).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const blob = await encrypt('data', 'MyP@ss1!');
      expect(await verifyPassword(blob, 'WrongPass1!')).toBe(false);
    });

    it('should never throw (safe for UI loops)', async () => {
      expect(await verifyPassword('garbage', 'anything')).toBe(false);
    });
  });

  //  Password Strength Validation 

  describe('validatePasswordStrength()', () => {
    it('should accept a strong password', () => {
      const result = validatePasswordStrength('MyStr0ng!Pass');
      expect(result.valid).toBe(true);
      expect(result.score).toBe(4);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = validatePasswordStrength('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least 8 characters required.');
    });

    it('should reject password without uppercase', () => {
      const result = validatePasswordStrength('abcdefg1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one uppercase letter required.');
    });

    it('should reject password without lowercase', () => {
      const result = validatePasswordStrength('ABCDEFG1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one lowercase letter required.');
    });

    it('should reject password without digit', () => {
      const result = validatePasswordStrength('Abcdefgh!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one digit required.');
    });

    it('should reject password without special character', () => {
      const result = validatePasswordStrength('Abcdefg1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one special character required.');
    });

    it('should return score 0 for all-numeric short password', () => {
      const result = validatePasswordStrength('123');
      expect(result.score).toBe(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('should report multiple failures', () => {
      const result = validatePasswordStrength('abc');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  //  Secure Token Generation 

  describe('generateSecureToken()', () => {
    it('should generate a hex string of correct length (default 32 bytes)', () => {
      const token = generateSecureToken();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[0-9a-f]+$/);
      expect(token.length).toBe(64); // 32 bytes × 2 hex chars
    });

    it('should generate a hex string of specified length', () => {
      const token = generateSecureToken(16);
      expect(token.length).toBe(32); // 16 bytes × 2 hex chars
    });

    it('should produce unique tokens on consecutive calls', () => {
      const t1 = generateSecureToken();
      const t2 = generateSecureToken();
      expect(t1).not.toBe(t2);
    });
  });

  //  CryptoError class 

  describe('CryptoError', () => {
    it('should be an instance of Error', () => {
      const err = new CryptoError('TEST_CODE', 'Test message');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(CryptoError);
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('Test message');
      expect(err.name).toBe('CryptoError');
    });
  });
});
