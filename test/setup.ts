/**
 * Bozzoo BTC Wallet - Test Setup
 *
 * Mocks for browser extension APIs (chrome.storage, chrome.runtime, chrome.alarms)
 * and Web Crypto API so tests can run in Node.js.
 */

import { webcrypto } from 'crypto';

//  Web Crypto API 
// Node.js provides crypto.webcrypto which is compatible with the browser's
// window.crypto / globalThis.crypto API.
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

//  TextEncoder / TextDecoder 
// Already available in Node.js >= 12, but ensure they're globally accessible.
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  (globalThis as any).TextEncoder = TextEncoder;
  (globalThis as any).TextDecoder = TextDecoder;
}

//  btoa / atob 
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  globalThis.atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
}

//  Mock chrome.storage.local & session 
const mockStore: Record<string, unknown> = {};
const mockSessionStore: Record<string, unknown> = {};

const mockChromeStorage = {
  local: {
    get: jest.fn((keys: string | string[], cb: (result: Record<string, unknown>) => void) => {
      const result: Record<string, unknown> = {};
      const keyArr = typeof keys === 'string' ? [keys] : keys;
      for (const key of keyArr) {
        if (key in mockStore) result[key] = mockStore[key];
      }
      cb(result);
    }),
    set: jest.fn((items: Record<string, unknown>, cb?: () => void) => {
      Object.assign(mockStore, items);
      if (cb) cb();
    }),
    remove: jest.fn((key: string, cb?: () => void) => {
      delete mockStore[key];
      if (cb) cb();
    }),
    clear: jest.fn((cb?: () => void) => {
      Object.keys(mockStore).forEach(k => delete mockStore[k]);
      if (cb) cb();
    }),
  },
  session: {
    get: jest.fn((keys: string | string[], cb: (result: Record<string, unknown>) => void) => {
      const result: Record<string, unknown> = {};
      const keyArr = typeof keys === 'string' ? [keys] : keys;
      for (const key of keyArr) {
        if (key in mockSessionStore) result[key] = mockSessionStore[key];
      }
      cb(result);
    }),
    set: jest.fn((items: Record<string, unknown>, cb?: () => void) => {
      Object.assign(mockSessionStore, items);
      if (cb) cb();
    }),
    remove: jest.fn((key: string, cb?: () => void) => {
      delete mockSessionStore[key];
      if (cb) cb();
    }),
    clear: jest.fn((cb?: () => void) => {
      Object.keys(mockSessionStore).forEach(k => delete mockSessionStore[k]);
      if (cb) cb();
    }),
  },
};

//  Mock chrome.runtime 
const mockChromeRuntime = {
  lastError: null as { message: string } | null,
  sendMessage: jest.fn().mockResolvedValue(undefined),
  onMessage: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
  },
  onInstalled: {
    addListener: jest.fn(),
  },
  OnInstalledReason: {
    INSTALL: 'install',
    UPDATE: 'update',
    CHROME_UPDATE: 'chrome_update',
  },
};

//  Mock chrome.alarms 
const mockChromeAlarms = {
  create: jest.fn(),
  clear: jest.fn((_name: string, cb?: () => void) => { if (cb) cb(); }),
  get: jest.fn((_name: string, cb: (alarm: any) => void) => cb(null)),
  onAlarm: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
};

//  Mock chrome.action 
const mockChromeAction = {
  setBadgeText: jest.fn(),
  setBadgeBackgroundColor: jest.fn(),
  openPopup: jest.fn().mockResolvedValue(undefined),
};

//  Assemble global chrome object 
(globalThis as any).chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
  alarms: mockChromeAlarms,
  action: mockChromeAction,
};

//  Mock sessionStorage 
const sessionStore: Record<string, string> = {};

(globalThis as any).sessionStorage = {
  getItem: jest.fn((key: string) => sessionStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { sessionStore[key] = value; }),
  removeItem: jest.fn((key: string) => { delete sessionStore[key]; }),
  clear: jest.fn(() => { Object.keys(sessionStore).forEach(k => delete sessionStore[k]); }),
  get length() { return Object.keys(sessionStore).length; },
  key: jest.fn((index: number) => Object.keys(sessionStore)[index] ?? null),
};

//  Mock localStorage 
const localStore: Record<string, string> = {};

(globalThis as any).localStorage = {
  getItem: jest.fn((key: string) => localStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { localStore[key] = value; }),
  removeItem: jest.fn((key: string) => { delete localStore[key]; }),
  clear: jest.fn(() => { Object.keys(localStore).forEach(k => delete localStore[k]); }),
  get length() { return Object.keys(localStore).length; },
  key: jest.fn((index: number) => Object.keys(localStore)[index] ?? null),
};

//  Cleanup helper 
export function clearAllMockStores(): void {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
  Object.keys(mockSessionStore).forEach(k => delete mockSessionStore[k]);
  Object.keys(sessionStore).forEach(k => delete sessionStore[k]);
  Object.keys(localStore).forEach(k => delete localStore[k]);
  mockChromeRuntime.lastError = null;
}

// Auto-clear between tests
beforeEach(() => {
  clearAllMockStores();
  jest.clearAllMocks();
});
