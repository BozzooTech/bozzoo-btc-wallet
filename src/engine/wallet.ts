/**
 * Bozzoo BTC Wallet — HD Wallet Engine (TypeScript)
 *
 * Derives Bitcoin addresses for all 4 supported types from a BIP-39 seed phrase.
 * Uses BIP-44/49/84/86 derivation paths.
 *
 * SECURITY: Private keys are NEVER stored.
 *           They are derived on-demand from the in-memory mnemonic
 *           only when a transaction needs to be signed.
 */

import * as bip39 from 'bip39';
import { encrypt, decrypt } from '../security/encryption';
import { saveEncryptedSeed, getEncryptedSeed, storageRemove, savePasswordHash, getPasswordHash, updateLastActive, storageClear } from './storage';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  let salt: Uint8Array;
  if (saltHex) {
    // Reconstruct salt from stored hex
    salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  } else {
    // Generate a fresh 32-byte random salt
    salt = crypto.getRandomValues(new Uint8Array(32));
  }
  const hash = await pbkdf2Async(sha256, password, salt, { c: 100000, dkLen: 32 });
  const hashHex = bytesToHex(hash);
  const finalSaltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, salt: finalSaltHex };
}

export async function createWallet(password: string, mnemonic: string) {
  const blob = await encrypt(mnemonic, password);
  await saveEncryptedSeed(JSON.stringify(blob));
  const { hash, salt } = await hashPassword(password);
  await savePasswordHash(JSON.stringify({ hash, salt }));
  await updateLastActive();
}

export async function verifyPasswordHash(password: string): Promise<boolean> {
  const storedHashData = await getPasswordHash();
  if (!storedHashData) return true; // no password set yet

  try {
    const parsed = JSON.parse(storedHashData);
    if (parsed.hash && parsed.salt) {
      const result = await hashPassword(password, parsed.salt);
      return result.hash === parsed.hash;
    }
    return false;
  } catch {
    // Legacy: plain hex hash with old hardcoded salt — still support for migration
    const legacyHash = await pbkdf2Async(sha256, password, 'bozzoo-salt', { c: 100000, dkLen: 32 });
    const isCorrect = bytesToHex(legacyHash) === storedHashData;
    if (isCorrect) {
      // Migrate: re-hash with random salt
      const { hash: newHash, salt: newSalt } = await hashPassword(password);
      await savePasswordHash(JSON.stringify({ hash: newHash, salt: newSalt }));
    }
    return isCorrect;
  }
}

export async function unlockWallet(password: string) {
  const storedHashData = await getPasswordHash();
  if (!storedHashData) {
    // If no password hash exists but encrypted seed does,
    // storage has been tampered with — refuse to unlock.
    const seedJson = await getEncryptedSeed();
    if (seedJson) return null; // Tampered: seed exists but hash was deleted
    return null; // No wallet exists
  }

  const isValid = await verifyPasswordHash(password);
  if (!isValid) return null;

  const seedJson = await getEncryptedSeed();
  if (!seedJson) return null;
  const blob = JSON.parse(seedJson);
  const result = await decrypt(blob, password);
  if (result) await updateLastActive();
  return result;
}

export async function clearWallet() {
  await storageClear();
}

import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import type { BIP32Interface } from 'bip32';
import type { ECPairInterface } from 'ecpair';
import type { AddressType, AddressInfo } from '../types/index';

//  Library Initialization 

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

// Bitcoin mainnet network params
const NETWORK: bitcoin.Network = bitcoin.networks.bitcoin;

//  Address Type Constants 

export const ADDRESS_TYPES: Record<string, AddressType> = {
  LEGACY: 'legacy',
  NESTED_SEGWIT: 'nested_segwit',
  NATIVE_SEGWIT: 'native_segwit',
  TAPROOT: 'taproot',
} as const;

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  legacy: 'Legacy (P2PKH)',
  nested_segwit: 'Nested SegWit (P2SH)',
  native_segwit: 'Native SegWit (P2WPKH)',
  taproot: 'Taproot (P2TR)',
};

export const ADDRESS_TYPE_PREFIXES: Record<AddressType, string> = {
  legacy: '1',
  nested_segwit: '3',
  native_segwit: 'bc1q',
  taproot: 'bc1p',
};

export const ADDRESS_TYPE_ICONS: Record<AddressType, string> = {
  legacy: '₿',
  nested_segwit: '⚡',
  native_segwit: '🔷',
  taproot: '🍃',
};

//  BIP Derivation Paths 

const DERIVATION_PURPOSE: Record<AddressType, string> = {
  legacy: "m/44'/0'",
  nested_segwit: "m/49'/0'",
  native_segwit: "m/84'/0'",
  taproot: "m/86'/0'",
};

export const MAX_BIP32_INDEX = 2147483647; // 2^31 - 1

//  Internal Helpers 

/**
 * Derives a BIP-32 root node from a mnemonic.
 * @internal
 */
async function getRootNode(
  mnemonic: string,
  passphrase: string = ''
): Promise<BIP32Interface> {
  const seed = await bip39.mnemonicToSeed(mnemonic.trim(), passphrase);
  return bip32.fromSeed(Buffer.from(seed), NETWORK);
}

/**
 * Returns an x-only (32-byte) public key for Taproot (BIP-340).
 * @internal
 */
export function toXOnly(pubkey: Buffer): Buffer {
  return Buffer.from(pubkey).slice(1, 33);
}

/**
 * Derives the account-level extended public key (xpub) for an address type.
 * e.g., m/84'/0'/0'
 */
export async function deriveAccountXpub(
  mnemonic: string,
  addressType: AddressType,
  accountIndex: number = 0
): Promise<string> {
  if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > MAX_BIP32_INDEX) {
    throw new Error(`Invalid account index. Must be between 0 and ${MAX_BIP32_INDEX}`);
  }
  const root = await getRootNode(mnemonic);
  const basePath = DERIVATION_PURPOSE[addressType];
  const fullPath = `${basePath}/${accountIndex}'`;
  const accountNode = root.derivePath(fullPath);
  return accountNode.neutered().toBase58();
}

//  Public API 

/**
 * Generates a new BIP-39 mnemonic seed phrase.
 * @param strength - Entropy bits. 128 = 12 words, 256 = 24 words. Default: 128
 */
export function generateMnemonic(strength: 128 | 256 = 128): string {
  return bip39.generateMnemonic(strength);
}

/**
 * Validates a BIP-39 mnemonic seed phrase.
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
}

/**
 * Derives a Bitcoin address at a specific index.
 *
 * @param xpub         - Account-level extended public key (xpub)
 * @param addressType  - One of the supported address types
 * @param addressIndex - Address index (0 = first receive address)
 * @param accountIndex - BIP-44 account index (default 0)
 * @param isChange     - True for BIP-32 internal (change) chain
 */
export async function deriveAddress(
  xpub: string,
  addressType: AddressType,
  addressIndex: number = 0,
  accountIndex: number = 0,
  isChange: boolean = false
): Promise<AddressInfo> {
  if (!Number.isInteger(addressIndex) || addressIndex < 0 || addressIndex > MAX_BIP32_INDEX) {
    throw new Error(`Invalid address index. Must be between 0 and ${MAX_BIP32_INDEX}`);
  }
  if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > MAX_BIP32_INDEX) {
    throw new Error(`Invalid account index. Must be between 0 and ${MAX_BIP32_INDEX}`);
  }
  const accountNode = bip32.fromBase58(xpub, NETWORK);
  const changeIndex = isChange ? 1 : 0;

  // The accountNode is already at m/purpose'/coin_type'/accountIndex'
  // So we just derive changeIndex/addressIndex
  const child = accountNode.derive(changeIndex).derive(addressIndex);

  const basePath = DERIVATION_PURPOSE[addressType];
  const fullPath = `${basePath}/${accountIndex}'/${changeIndex}/${addressIndex}`;

  let address: string;

  switch (addressType) {
    case 'legacy': {
      const p2pkh = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: NETWORK,
      });
      if (!p2pkh.address) throw new Error('Failed to derive Legacy address.');
      address = p2pkh.address;
      break;
    }

    case 'nested_segwit': {
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: NETWORK,
      });
      const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network: NETWORK });
      if (!p2sh.address) throw new Error('Failed to derive Nested SegWit address.');
      address = p2sh.address;
      break;
    }

    case 'native_segwit': {
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: NETWORK,
      });
      if (!p2wpkh.address) throw new Error('Failed to derive Native SegWit address.');
      address = p2wpkh.address;
      break;
    }

    case 'taproot': {
      const internalKey = toXOnly(child.publicKey);
      const p2tr = bitcoin.payments.p2tr({
        internalPubkey: internalKey,
        network: NETWORK,
      });
      if (!p2tr.address) throw new Error('Failed to derive Taproot address.');
      address = p2tr.address;
      break;
    }

    default: {
      const _exhaustive: never = addressType;
      throw new Error(`Unknown address type: ${String(_exhaustive)}`);
    }
  }

  return {
    address,
    publicKey: child.publicKey,
    path: fullPath,
    index: addressIndex,
    type: addressType,
  };
}

/**
 * Derives a signing keypair for a specific address.
 * Used ONLY during transaction signing — the result is never stored or logged.
 *
 * @param mnemonic    - Decrypted seed phrase
 * @param addressType - Address type
 * @param addressIndex - Address index
 * @param accountIndex - BIP-44 account index
 * @param isChange    - Whether this is a change address
 */
export async function deriveKeyPair(
  mnemonic: string,
  addressType: AddressType,
  addressIndex: number = 0,
  accountIndex: number = 0,
  isChange: boolean = false
): Promise<ECPairInterface> {
  if (!Number.isInteger(addressIndex) || addressIndex < 0 || addressIndex > MAX_BIP32_INDEX) {
    throw new Error(`Invalid address index. Must be between 0 and ${MAX_BIP32_INDEX}`);
  }
  if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > MAX_BIP32_INDEX) {
    throw new Error(`Invalid account index. Must be between 0 and ${MAX_BIP32_INDEX}`);
  }
  const root = await getRootNode(mnemonic);
  const basePath = DERIVATION_PURPOSE[addressType];
  const changeIndex = isChange ? 1 : 0;
  const fullPath = `${basePath}/${accountIndex}'/${changeIndex}/${addressIndex}`;
  const child = root.derivePath(fullPath);

  if (!child.privateKey) {
    throw new Error('BIP-32 child node has no private key (watch-only path?).');
  }

  return ECPair.fromPrivateKey(child.privateKey, { network: NETWORK });
}

/**
 * Returns the bitcoinjs-lib payment object for a given address type + public key.
 * Used internally for PSBT input/output construction.
 */
export function getPayment(
  addressType: AddressType,
  publicKey: Buffer
): bitcoin.payments.Payment {
  const pubkey = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey);

  switch (addressType) {
    case 'legacy':
      return bitcoin.payments.p2pkh({ pubkey, network: NETWORK });

    case 'nested_segwit': {
      const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network: NETWORK });
      return bitcoin.payments.p2sh({ redeem: p2wpkh, network: NETWORK });
    }

    case 'native_segwit':
      return bitcoin.payments.p2wpkh({ pubkey, network: NETWORK });

    case 'taproot':
      return bitcoin.payments.p2tr({
        internalPubkey: toXOnly(pubkey),
        network: NETWORK,
      });

    default: {
      const _exhaustive: never = addressType;
      throw new Error(`Unknown address type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Generates a consecutive range of addresses.
 * Used to populate receive address lists and scan for balance.
 */
export async function generateAddressRange(
  xpub: string,
  addressType: AddressType,
  count: number = 5,
  startIndex: number = 0,
  accountIndex: number = 0
): Promise<AddressInfo[]> {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > MAX_BIP32_INDEX) {
    throw new Error(`Invalid start index. Must be between 0 and ${MAX_BIP32_INDEX}`);
  }
  if (startIndex + count - 1 > MAX_BIP32_INDEX) {
    throw new Error(`Address range exceeds maximum allowed index of ${MAX_BIP32_INDEX}`);
  }
  const addresses: AddressInfo[] = [];

  for (let i = startIndex; i < startIndex + count; i++) {
    addresses.push(await deriveAddress(xpub, addressType, i, accountIndex));
  }

  return addresses;
}
