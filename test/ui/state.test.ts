/**
 * Bozzoo BTC Wallet - UI State Module Tests
 */

import {
  state,
  clearSession,
  clearPending,
  signalActivity,
} from '../../src/ui/state';

describe('ui/state', () => {

  // Reset state before each test
  beforeEach(() => {
    state.unlockedXpubs = {};
    state.pendingMnemonic = null;
    state.pendingAddressType = null;
    delete state.tempMnemonic;
    state.activeAccountId = null;
    state.accounts = [];
    state.currentAddressType = 'native_segwit';
    state.currentAddressIndex = 0;
    state.btcPrice = 0;
    state.balance = null;
    state.pendingTxs = [];
  });

  describe('clearSession()', () => {
    it('should clear unlockedXpubs', () => {
      state.unlockedXpubs = { 'acc-1': { 'native_segwit': 'xpub' } as any };
      clearSession();
      expect(state.unlockedXpubs).toEqual({});
    });

    it('should clear balance', () => {
      state.balance = { confirmed: 100, unconfirmed: 0, total: 100 };
      clearSession();
      expect(state.balance).toBeNull();
    });

    it('should clear pendingTxs', () => {
      state.pendingTxs = [{ txid: 'abc', timestamp: Date.now(), type: 'sent', value: -1000 }];
      clearSession();
      expect(state.pendingTxs).toEqual([]);
    });

    it('should clear accounts and activeAccountId', () => {
      state.accounts = [{ id: 'acc-1', name: 'Test', addressType: 'native_segwit', accountIndex: 0, encryptedSeed: 'abc' }];
      state.activeAccountId = 'acc-1';
      clearSession();
      expect(state.accounts).toEqual([]);
      expect(state.activeAccountId).toBeNull();
    });

    it('should clear tempMnemonic', () => {
      state.tempMnemonic = 'lingering seed phrase from creation flow';
      clearSession();
      expect(state.tempMnemonic).toBeUndefined();
    });
  });

  describe('clearPending()', () => {
    it('should clear only pending creation data', () => {
      state.pendingMnemonic = 'pending seed';
      state.pendingAddressType = 'taproot';
      state.unlockedXpubs = { 'acc-1': { 'native_segwit': 'xpub' } as any };

      clearPending();

      expect(state.pendingMnemonic).toBeNull();
      expect(state.pendingAddressType).toBeNull();
      // Should NOT clear the active unlockedXpubs
      expect(state.unlockedXpubs['acc-1']).toBeDefined();
    });
  });

  describe('signalActivity()', () => {
    it('should not throw when called without chrome runtime', () => {
      state.unlockedXpubs = { 'acc-1': { 'native_segwit': 'xpub' } as any };
      expect(() => signalActivity()).not.toThrow();
    });
  });
});
