/**
 * Bozzoo BTC Wallet — Application State (TypeScript)
 *
 * Single shared state object for the popup UI.
 * Session is synced to background script (chrome.storage.session)
 * to persist across popup opens/closes.
 */

import type { AppState } from '../types/index';
import { getPasswordHash } from '../engine/storage';
import { encrypt, decrypt } from '../security/encryption';

const DEFAULT_STATE: AppState = {
  unlockedXpubs: {},
  pendingMnemonic: null,
  pendingAddressType: null,
  activeAccountId: null,
  accounts: [],
  currentAddressType: 'native_segwit',
  currentAddressIndex: 0,
  btcPrice: 0,
  balance: null,
  pendingTxs: [],
};

/**
 * Global wallet state.
 * Mutate directly — state is a plain object (no reactivity needed for a popup).
 */
export const state: AppState = { ...DEFAULT_STATE };

/** Clears all in-memory session data and background session. Call this on wallet lock. */
export function clearSession(): void {
  state.unlockedXpubs = {};
  delete state.tempMnemonic; // clear lingering seed phrase
  state.balance = null;
  state.pendingTxs = [];
  state.accounts = [];
  state.activeAccountId = null;
  
  const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  if (isExtension) {
    chrome.runtime.sendMessage({ type: 'CLEAR_SESSION' }).catch(() => {});
  } else if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.removeItem('bozzoo_dev_session');
  }
}

/** Clears the pending creation-flow data after wallet is saved. */
export function clearPending(): void {
  state.pendingMnemonic = null;
  state.pendingAddressType = null;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

export async function saveSessionToBackground(): Promise<void> {
  if (Object.keys(state.unlockedXpubs).length > 0) {
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    const sessionData = {
      unlockedXpubs: state.unlockedXpubs,
      lastActive: Date.now()
    };
    
    try {
      const hash = await getPasswordHash();
      if (!hash) return;
      
      const encryptedSession = await encrypt(JSON.stringify(sessionData), hash);
      const obfuscatedString = encryptedSession.data;

      if (isExtension) {
        chrome.runtime.sendMessage({
          type: 'SAVE_SESSION',
          sessionData: obfuscatedString
        }).catch(() => {});
      } else if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('bozzoo_dev_session', obfuscatedString);
      }
    } catch (e) {
      console.error('Failed to obfuscate session', e);
    }
  }
}

/** Checks if the session is still active in background (within 10 minutes) */
export async function loadSessionFromBackground(): Promise<boolean> {
  const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  
  const processSessionData = async (obfuscatedData: any) => {
    try {
      if (typeof obfuscatedData === 'string') {
        const hash = await getPasswordHash();
        if (!hash) return false;
        
        const decryptedJson = await decrypt(obfuscatedData, hash);
        const data = JSON.parse(decryptedJson);

        if (data && data.lastActive && Date.now() - data.lastActive < TEN_MINUTES_MS) {
          state.unlockedXpubs = data.unlockedXpubs || {};
          saveSessionToBackground();
          return Object.keys(state.unlockedXpubs).length > 0;
        }
      }
    } catch (e) {
      // Ignore padding errors from old plaintext sessions
    }
    clearSession();
    return false;
  };

  if (!isExtension) {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem('bozzoo_dev_session');
      if (stored) {
        return await processSessionData(stored);
      }
    }
    return false;
  }

  try {
    const response = await new Promise<any>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('GET_SESSION timeout reached');
          resolve(null);
        }
      }, 5000); // 5-second safety timeout

      chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (res) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            console.warn('GET_SESSION error:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(res);
          }
        }
      });
    });

    if (response && response.ok && response.sessionData) {
      return await processSessionData(response.sessionData);
    }
  } catch (e) {
    console.error('Failed to load session from background', e);
  }
  return false;
}

/** Signals user activity to reset the auto-lock timer. */
export function signalActivity(): void {
  // Update local session storage
  if (Object.keys(state.unlockedXpubs).length > 0) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' }).catch(() => { });
    }
  }
}
