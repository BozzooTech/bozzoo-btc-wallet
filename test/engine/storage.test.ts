/**
 * Bozzoo BTC Wallet — Storage Module Tests
 *
 * Tests for the chrome.storage.local wrapper including
 * CRUD operations, wallet config, and key management.
 */

import {
  saveEncryptedSeed,
  getEncryptedSeed,
  walletExists,
  saveWalletConfig,
  getWalletConfig,
  saveAddressIndexMap,
  getAddressIndexMap,
  incrementAddressIndex,
  saveSettings,
  getSettings,
  deleteWallet,
  savePasswordHash,
  getPasswordHash,
  updateLastActive,
  getLastActive,
  storageClear,
} from '../../src/engine/storage';

describe('engine/storage', () => {

  //  Encrypted Seed 

  describe('saveEncryptedSeed() / getEncryptedSeed()', () => {
    it('should save and retrieve encrypted seed', async () => {
      await saveEncryptedSeed('encrypted-blob-data');
      const result = await getEncryptedSeed();
      expect(result).toBe('encrypted-blob-data');
    });

    it('should return null when no seed saved', async () => {
      const result = await getEncryptedSeed();
      expect(result).toBeNull();
    });
  });

  //  walletExists 

  describe('walletExists()', () => {
    it('should return false when no seed exists', async () => {
      expect(await walletExists()).toBe(false);
    });

    it('should return true when seed exists', async () => {
      await saveEncryptedSeed('some-data');
      expect(await walletExists()).toBe(true);
    });

    it('should return false for empty string seed', async () => {
      await saveEncryptedSeed('');
      expect(await walletExists()).toBe(false);
    });
  });

  //  Wallet Config 

  describe('saveWalletConfig() / getWalletConfig()', () => {
    it('should save and retrieve wallet config', async () => {
      const config = {
        activeAccountId: 'acc-1',
        accounts: [{
          id: 'acc-1',
          name: 'Wallet 1',
          addressType: 'native_segwit' as const,
          accountIndex: 0,
        }],
      };
      await saveWalletConfig(config);
      const result = await getWalletConfig();
      expect(result.activeAccountId).toBe('acc-1');
      expect(result.accounts).toHaveLength(1);
    });

    it('should return defaults when no config exists', async () => {
      const result = await getWalletConfig();
      expect(result.activeAccountId).toBeNull();
      expect(result.accounts).toEqual([]);
    });
  });

  //  Address Index Map 

  describe('getAddressIndexMap() / incrementAddressIndex()', () => {
    it('should return default zeros when no map stored', async () => {
      const map = await getAddressIndexMap();
      expect(map.legacy).toBe(0);
      expect(map.nested_segwit).toBe(0);
      expect(map.native_segwit).toBe(0);
      expect(map.taproot).toBe(0);
    });

    it('should increment address index and persist', async () => {
      const newIndex = await incrementAddressIndex('native_segwit');
      expect(newIndex).toBe(1);

      const map = await getAddressIndexMap();
      expect(map.native_segwit).toBe(1);
    });

    it('should increment independently per type', async () => {
      await incrementAddressIndex('legacy');
      await incrementAddressIndex('legacy');
      await incrementAddressIndex('taproot');

      const map = await getAddressIndexMap();
      expect(map.legacy).toBe(2);
      expect(map.taproot).toBe(1);
      expect(map.native_segwit).toBe(0);
    });
  });

  //  Settings 

  describe('saveSettings() / getSettings()', () => {
    it('should return defaults when no settings exist', async () => {
      const settings = await getSettings();
      expect(settings.autoLockMinutes).toBe(15);
      expect(settings.torMode).toBe(false);
      expect(settings.currency).toBe('USD');
      expect(settings.network).toBe('mainnet');
    });

    it('should save and retrieve settings', async () => {
      await saveSettings({
        autoLockMinutes: 30,
        torMode: true,
        currency: 'EUR',
        network: 'mainnet',
      });
      const settings = await getSettings();
      expect(settings.autoLockMinutes).toBe(30);
      expect(settings.torMode).toBe(true);
      expect(settings.currency).toBe('EUR');
    });
  });

  //  Password Hash 

  describe('savePasswordHash() / getPasswordHash()', () => {
    it('should save and retrieve password hash', async () => {
      await savePasswordHash('abc123hex');
      const result = await getPasswordHash();
      expect(result).toBe('abc123hex');
    });

    it('should return null when no hash exists', async () => {
      const result = await getPasswordHash();
      expect(result).toBeNull();
    });
  });

  //  Last Active 

  describe('updateLastActive() / getLastActive()', () => {
    it('should save and retrieve last active timestamp', async () => {
      const before = Date.now();
      await updateLastActive();
      const result = await getLastActive();
      expect(result).toBeGreaterThanOrEqual(before);
    });

    it('should return null when never set', async () => {
      const result = await getLastActive();
      expect(result).toBeNull();
    });
  });

  //  Delete Wallet 

  describe('deleteWallet()', () => {
    it('should clear all stored data', async () => {
      await saveEncryptedSeed('seed-data');
      await savePasswordHash('hash-data');
      await updateLastActive();

      await deleteWallet();

      expect(await getEncryptedSeed()).toBeNull();
      expect(await getPasswordHash()).toBeNull();
      expect(await getLastActive()).toBeNull();
    });
  });

  //  storageClear 

  describe('storageClear()', () => {
    it('should clear all storage', async () => {
      await saveEncryptedSeed('data');
      await storageClear();
      expect(await walletExists()).toBe(false);
    });
  });
});
