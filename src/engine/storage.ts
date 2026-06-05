/**
 * Bozzoo BTC Wallet — Storage Layer (TypeScript)
 *
 * Type-safe async/await wrapper over chrome.storage.local.
 * Cross-browser compatible: works with both chrome.storage and browser.storage (Firefox/Tor).
 */

import type { WalletConfig, AddressIndexMap, StoredSettings } from '../types/index';

//  Cross-browser shim 
// Firefox exposes `browser`, Chrome exposes `chrome`. Both have the same API.
declare var browser: any;
const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const storageAPI: chrome.storage.LocalStorageArea | null =
  isExt
    ? (typeof browser !== 'undefined'
      ? (browser as typeof chrome).storage.local
      : chrome.storage.local)
    : null;

//  Generic storage helpers 

function storageSet(key: string, value: unknown): Promise<void> {
  if (!storageAPI) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    storageAPI.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

function storageGet<T>(key: string): Promise<T | undefined> {
  if (!storageAPI) {
    if (typeof window !== 'undefined' && window.localStorage) {
      const item = window.localStorage.getItem(key);
      if (item) {
        try { return Promise.resolve(JSON.parse(item) as T); }
        catch { return Promise.resolve(item as any); }
      }
    }
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    storageAPI.get(key, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[key] as T | undefined);
      }
    });
  });
}

function storageRemove(key: string): Promise<void> {
  if (!storageAPI) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    storageAPI.remove(key, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export function storageClear(): Promise<void> {
  if (!storageAPI) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    storageAPI.clear(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

//  Storage Key Constants 

const KEYS = {
  ENCRYPTED_SEED: 'bozzoo_encrypted_seed',
  WALLET_CONFIG: 'bozzoo_wallet_config',
  ADDRESS_INDEX: 'bozzoo_address_index',
  TRANSACTIONS: 'bozzoo_transactions',
  SETTINGS: 'bozzoo_settings',
  PASSWORD_HASH: 'bozzoo_password_hash',
  LAST_ACTIVE: 'bozzoo_last_active',
} as const;

//  Typed Domain API 

/** Saves the AES-256-GCM encrypted seed blob (base64 string) */
export async function saveEncryptedSeed(blob: string): Promise<void> {
  await storageSet(KEYS.ENCRYPTED_SEED, blob);
}

/** Returns the stored encrypted seed blob, or null if wallet not created */
export async function getEncryptedSeed(): Promise<string | null> {
  return (await storageGet<string>(KEYS.ENCRYPTED_SEED)) ?? null;
}

/** Returns true if an encrypted wallet exists in storage */
export async function walletExists(): Promise<boolean> {
  const seed = await getEncryptedSeed();
  return seed !== null && seed.length > 0;
}

/** Saves wallet configuration (address type, account index) */
export async function saveWalletConfig(config: WalletConfig): Promise<void> {
  await storageSet(KEYS.WALLET_CONFIG, config);
}

/** Returns wallet configuration, or sensible defaults */
export async function getWalletConfig(): Promise<WalletConfig> {
  const config = await storageGet<WalletConfig>(KEYS.WALLET_CONFIG);
  if (config) {
    // Backwards compatibility for old config
    if ('addressType' in config) {
      const old = config as any;
      return {
        activeAccountId: 'default',
        accounts: [{
          id: 'default',
          name: 'Wallet 1',
          addressType: old.addressType,
          accountIndex: old.accountIndex
        }]
      };
    }
    return config;
  }
  return { activeAccountId: null, accounts: [] };
}

/** Saves per-type address index map */
export async function saveAddressIndexMap(map: AddressIndexMap): Promise<void> {
  await storageSet(KEYS.ADDRESS_INDEX, map);
}

/** Returns the address index map */
export async function getAddressIndexMap(): Promise<AddressIndexMap> {
  const map = await storageGet<AddressIndexMap>(KEYS.ADDRESS_INDEX);
  return map ?? { legacy: 0, nested_segwit: 0, native_segwit: 0, taproot: 0 };
}

/** Increments the address index for a given type and saves to storage */
export async function incrementAddressIndex(
  type: keyof AddressIndexMap
): Promise<number> {
  const map = await getAddressIndexMap();
  map[type] += 1;
  await saveAddressIndexMap(map);
  return map[type];
}

/** Saves user settings */
export async function saveSettings(settings: StoredSettings): Promise<void> {
  await storageSet(KEYS.SETTINGS, settings);
}

/** Returns user settings, or defaults */
export async function getSettings(): Promise<StoredSettings> {
  const settings = await storageGet<StoredSettings>(KEYS.SETTINGS);
  return settings ?? {
    autoLockMinutes: 15,
    torMode: false,
    currency: 'USD',
    network: 'mainnet',
  };
}

/**
 * Permanently deletes all wallet data from storage.
 * WARNING: This is irreversible without the seed phrase backup.
 */
export async function deleteWallet(): Promise<void> {
  await storageClear();
}

/** Saves the PBKDF2 hash of the password for fast 1-way verification */
export async function savePasswordHash(hashHex: string): Promise<void> {
  await storageSet(KEYS.PASSWORD_HASH, hashHex);
}

/** Retrieves the stored password hash */
export async function getPasswordHash(): Promise<string | null> {
  return (await storageGet<string>(KEYS.PASSWORD_HASH)) ?? null;
}

/** Updates the last active timestamp to prevent 60-day expiry */
export async function updateLastActive(): Promise<void> {
  await storageSet(KEYS.LAST_ACTIVE, Date.now());
}

/** Gets the last active timestamp */
export async function getLastActive(): Promise<number | null> {
  return (await storageGet<number>(KEYS.LAST_ACTIVE)) ?? null;
}

export { storageRemove };
