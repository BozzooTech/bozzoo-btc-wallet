/**
 * Bozzoo BTC Wallet — Transaction Module Tests
 *
 * Tests for developer fee calculation, address validation,
 * and transaction builder edge cases.
 */

import {
  validateAddress,
  isValidBitcoinAddress,
  DONATION_ADDRESS,
} from '../../src/engine/transaction';

describe('engine/transaction', () => {

  //  Address Validation 

  describe('validateAddress()', () => {
    it('should validate Legacy address', () => {
      // Known valid mainnet address
      const result = validateAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('legacy');
      expect(result.error).toBeNull();
    });

    it('should reject empty address', () => {
      const result = validateAddress('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Address is required.');
    });

    it('should reject null/undefined address', () => {
      const result = validateAddress(null as any);
      expect(result.valid).toBe(false);
    });

    it('should reject completely invalid address', () => {
      const result = validateAddress('not-a-bitcoin-address');
      expect(result.valid).toBe(false);
      expect(result.type).toBeNull();
    });

    it('should handle whitespace-padded address', () => {
      const result = validateAddress('  1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa  ');
      expect(result.valid).toBe(true);
    });
  });

  //  isValidBitcoinAddress 

  describe('isValidBitcoinAddress()', () => {
    it('should accept a valid Legacy address', () => {
      expect(isValidBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
    });

    it('should reject garbage strings', () => {
      expect(isValidBitcoinAddress('garbage')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidBitcoinAddress('')).toBe(false);
    });
  });

  //  Donation Address Config 

  describe('DONATION_ADDRESS', () => {
    it('should be a string longer than 20 characters', () => {
      expect(typeof DONATION_ADDRESS).toBe('string');
      expect(DONATION_ADDRESS.length).toBeGreaterThan(20);
    });

    it('should not contain placeholder text', () => {
      expect(DONATION_ADDRESS).not.toContain('your');
      expect(DONATION_ADDRESS).not.toContain('replace');
    });

    it('should be a valid Bitcoin address', () => {
      expect(isValidBitcoinAddress(DONATION_ADDRESS)).toBe(true);
    });
  });
});
