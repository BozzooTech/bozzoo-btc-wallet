/**
 * Bozzoo BTC Wallet - Wallet Engine Tests
 *
 * Tests for HD wallet derivation, mnemonic generation/validation,
 * address derivation across all 4 address types, and wallet CRUD.
 */

import {
  generateMnemonic,
  validateMnemonic,
  deriveAddress,
  deriveAccountXpub,
  deriveKeyPair,
  getPayment,
  toXOnly,
  ADDRESS_TYPES,
  ADDRESS_TYPE_PREFIXES,
  createWallet,
  unlockWallet,
} from '../../src/engine/wallet';

// Known test mnemonic (DO NOT use for real funds)
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('engine/wallet', () => {

  //  Mnemonic Generation 

  describe('generateMnemonic()', () => {
    it('should generate a valid 12-word mnemonic (128-bit)', () => {
      const mnemonic = generateMnemonic(128);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate a valid 24-word mnemonic (256-bit)', () => {
      const mnemonic = generateMnemonic(256);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(24);
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate unique mnemonics on each call', () => {
      const m1 = generateMnemonic();
      const m2 = generateMnemonic();
      expect(m1).not.toBe(m2);
    });
  });

  //  Mnemonic Validation 

  describe('validateMnemonic()', () => {
    it('should accept a valid mnemonic', () => {
      expect(validateMnemonic(TEST_MNEMONIC)).toBe(true);
    });

    it('should reject an invalid mnemonic (wrong words)', () => {
      expect(validateMnemonic('invalid words that are not bip39')).toBe(false);
    });

    it('should reject an incomplete mnemonic', () => {
      expect(validateMnemonic('abandon abandon abandon')).toBe(false);
    });

    it('should handle leading/trailing whitespace', () => {
      expect(validateMnemonic(`  ${TEST_MNEMONIC}  `)).toBe(true);
    });

    it('should handle mixed case', () => {
      expect(validateMnemonic(TEST_MNEMONIC.toUpperCase())).toBe(true);
    });
  });

  //  Address Derivation 

  describe('deriveAddress()', () => {
    it('should derive a Legacy (P2PKH) address starting with "1"', async () => {
      const xpub = await deriveAccountXpub(TEST_MNEMONIC, 'legacy', 0);
      const info = await deriveAddress(xpub, 'legacy', 0, 0);
      expect(info.address).toMatch(/^1/);
      expect(info.type).toBe('legacy');
      expect(info.index).toBe(0);
      expect(info.path).toContain("44'");
    });

    it('should derive a Nested SegWit (P2SH) address starting with "3"', async () => {
      const xpub = await deriveAccountXpub(TEST_MNEMONIC, 'nested_segwit', 0);
      const info = await deriveAddress(xpub, 'nested_segwit', 0, 0);
      expect(info.address).toMatch(/^3/);
      expect(info.type).toBe('nested_segwit');
      expect(info.path).toContain("49'");
    });

    it('should derive a Native SegWit (P2WPKH) address starting with "bc1q"', async () => {
      const xpub = await deriveAccountXpub(TEST_MNEMONIC, 'native_segwit', 0);
      const info = await deriveAddress(xpub, 'native_segwit', 0, 0);
      expect(info.address).toMatch(/^bc1q/);
      expect(info.type).toBe('native_segwit');
      expect(info.path).toContain("84'");
    });

    it('should derive a Taproot (P2TR) address starting with "bc1p"', async () => {
      const xpub = await deriveAccountXpub(TEST_MNEMONIC, 'taproot', 0);
      const info = await deriveAddress(xpub, 'taproot', 0, 0);
      expect(info.address).toMatch(/^bc1p/);
      expect(info.type).toBe('taproot');
      expect(info.path).toContain("86'");
    });

    it('should derive different addresses at different indices', async () => {
      const xpub = await deriveAccountXpub(TEST_MNEMONIC, 'native_segwit', 0);
      const a0 = await deriveAddress(xpub, 'native_segwit', 0);
      const a1 = await deriveAddress(xpub, 'native_segwit', 1);
      expect(a0.address).not.toBe(a1.address);
    });

    it('should derive deterministic addresses (same xpub + index)', async () => {
      const xpub = await deriveAccountXpub(TEST_MNEMONIC, 'native_segwit', 0);
      const a1 = await deriveAddress(xpub, 'native_segwit', 0);
      const a2 = await deriveAddress(xpub, 'native_segwit', 0);
      expect(a1.address).toBe(a2.address);
    });

    it('should include public key in result', async () => {
      const xpub = await deriveAccountXpub(TEST_MNEMONIC, 'native_segwit', 0);
      const info = await deriveAddress(xpub, 'native_segwit', 0);
      expect(info.publicKey).toBeDefined();
      expect(Buffer.isBuffer(info.publicKey)).toBe(true);
      expect(info.publicKey.length).toBe(33); // compressed public key
    });
  });

  //  Key Pair Derivation 

  describe('deriveKeyPair()', () => {
    it('should derive a keypair with a private key', async () => {
      const kp = await deriveKeyPair(TEST_MNEMONIC, 'native_segwit', 0);
      expect(kp.privateKey).toBeDefined();
      expect(kp.privateKey!.length).toBe(32);
      expect(kp.publicKey.length).toBe(33);
    });

    it('should derive the same keypair for the same path', async () => {
      const kp1 = await deriveKeyPair(TEST_MNEMONIC, 'native_segwit', 0);
      const kp2 = await deriveKeyPair(TEST_MNEMONIC, 'native_segwit', 0);
      expect(kp1.privateKey!.equals(kp2.privateKey!)).toBe(true);
    });
  });

  //  getPayment 

  describe('getPayment()', () => {
    it('should return payment for all address types', async () => {
      const kp = await deriveKeyPair(TEST_MNEMONIC, 'native_segwit', 0);

      for (const type of Object.values(ADDRESS_TYPES)) {
        const payment = getPayment(type, kp.publicKey);
        expect(payment).toBeDefined();
        if (payment.address) {
          const prefix = ADDRESS_TYPE_PREFIXES[type];
          expect(payment.address.startsWith(prefix)).toBe(true);
        }
      }
    });
  });

  //  toXOnly 

  describe('toXOnly()', () => {
    it('should produce a 32-byte buffer from a 33-byte compressed pubkey', async () => {
      const kp = await deriveKeyPair(TEST_MNEMONIC, 'taproot', 0);
      const xOnly = toXOnly(kp.publicKey);
      expect(xOnly.length).toBe(32);
    });
  });

  //  Wallet Create / Unlock 

  describe('createWallet() + unlockWallet()', () => {
    it('should create and unlock wallet with correct password', async () => {
      const password = 'TestP@ss1!';
      const mnemonic = generateMnemonic();

      await createWallet(password, mnemonic);

      const result = await unlockWallet(password);
      expect(result).toBe(mnemonic);
    });

    it('should fail to unlock with wrong password', async () => {
      const password = 'TestP@ss1!';
      const mnemonic = generateMnemonic();

      await createWallet(password, mnemonic);

      const result = await unlockWallet('WrongP@ss1!');
      expect(result).toBeNull();
    });

    it('should return null when no wallet exists', async () => {
      const result = await unlockWallet('anything');
      expect(result).toBeNull();
    });
  });
});
