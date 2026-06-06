/**
 * Bozzoo BTC Wallet - Shared Type Definitions
 *
 * Single source of truth for all types used across engine, UI, and security layers.
 * Import from here, never re-declare types in individual modules.
 */

//  Bitcoin Address Types 

export type AddressType =
  | 'legacy'         // P2PKH   - 1...   - BIP-44  m/44'/0'/0'
  | 'nested_segwit'  // P2SH    - 3...   - BIP-49  m/49'/0'/0'
  | 'native_segwit'  // P2WPKH  - bc1q.. - BIP-84  m/84'/0'/0'
  | 'taproot';       // P2TR    - bc1p.. - BIP-86  m/86'/0'/0'

export type FeeSpeed = 'slow' | 'medium' | 'fast';
export type TxType = 'received' | 'sent';

export type Route =
  | 'welcome'
  | 'create'
  | 'import'
  | 'set-password'
  | 'unlock'
  | 'dashboard'
  | 'send'
  | 'receive'
  | 'settings';

//  Wallet / HD Derivation 

export interface AddressInfo {
  address: string;
  publicKey: Buffer;
  path: string;
  index: number;
  type: AddressType;
}

export interface DerivationConfig {
  addressType: AddressType;
  accountIndex: number;
  addressIndex: number;
  isChange: boolean;
}

//  Network / API 

export interface UTXO {
  txid: string;
  vout: number;
  value: number;         // satoshis
  confirmed: boolean;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

export interface Transaction {
  txid: string;
  confirmed: boolean;
  blockTime: number | null;
  blockHeight: number | null;
  fee: number;
  value: number;     // positive = received, negative = sent (satoshis)
  received: number;
  sent: number;
  type: TxType;
}

export interface BalanceInfo {
  confirmed: number;   // satoshis
  unconfirmed: number;   // satoshis
  total: number;   // satoshis
}

export interface FeeRates {
  fastestFee: number;   // sat/vB - ~10 min
  halfHourFee: number;   // sat/vB - ~30 min
  hourFee: number;   // sat/vB - ~60 min
  economyFee: number;   // sat/vB - economy
  minimumFee: number;   // sat/vB - minimum relay
}

//  Transaction Building 

export interface FeeEstimate {
  feeRate: number;
  estimatedSize: number;   // vbytes
  minerFee: number;   // satoshis
  totalFee: number;   // satoshis
  change: number;   // satoshis
  totalAvailable: number;   // satoshis
  canAfford: boolean;
  utxos: UTXO[];
}

export interface Recipient {
  address: string;
  amountSats: number;
}

export interface SendParams {
  mnemonic: string;
  fromAddress: string;
  fromAddressType: AddressType;
  fromAddressIndex: number;
  fromAccountIndex?: number;
  recipients: Recipient[];
  feeRateSatVb: number;
  sendMax?: boolean;
  selectedUtxoIds?: string[];
}

export interface BroadcastResult {
  txid: string;
  rawHex: string;
}

export interface AddressValidation {
  valid: boolean;
  type: AddressType | null;
  error: string | null;
}

//  Storage 

export interface WalletAccount {
  id: string;       // unique id
  name: string;       // User-defined name
  addressType: AddressType;
  accountIndex: number;       // BIP-44 account index
  lastAddressIndex?: number;  // Last used address index
  encryptedSeed?: string;     // If present, this is a root wallet
  parentId?: string;       // If present, this belongs to the wallet with this id
  lastActiveSubAccountId?: string; // Remembers the last sub-account used for this root wallet
}

export interface WalletConfig {
  activeAccountId: string | null;
  accounts: WalletAccount[];
}

export interface AddressIndexMap {
  legacy: number;
  nested_segwit: number;
  native_segwit: number;
  taproot: number;
}

export interface StoredSettings {
  autoLockMinutes: number;
  torMode: boolean;
  currency: string;
  network: 'mainnet';   // only mainnet supported
}

//  Application State 

export interface AppState {
  // Ephemeral memory (cleared on lock)
  unlockedXpubs: Record<string, Record<AddressType, string>>; // Maps accountId -> { type: xpub }
  pendingMnemonic: string | null;
  pendingAddressType: AddressType | null;
  tempMnemonic?: string;

  // Persistent UI state
  activeAccountId: string | null;
  accounts: WalletAccount[];
  currentAddressType: AddressType;
  currentAddressIndex: number;

  // Cached data
  btcPrice: number;
  balance: BalanceInfo | null;
  pendingTxs: { txid: string, timestamp: number, type: 'sent' | 'received', value: number }[];
}

//  Page / Component 

export interface PageModule {
  render: (params?: Record<string, string>) => string;
  init: (params?: Record<string, string>) => void | Promise<void>;
  cleanup?: () => void;
}

//  Crypto 

export interface PasswordStrengthResult {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  errors: string[];
}
