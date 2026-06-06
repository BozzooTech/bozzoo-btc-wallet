/**
 * Bozzoo BTC Wallet - Network / API Layer (TypeScript)
 *
 * Primary:  blockchain.info (Official Blockchain API)
 * Fallback: mempool.space  (self-hostable, privacy-preserving)
 */

import type {
  UTXO,
  Transaction,
  BalanceInfo,
  FeeRates,
} from '../types/index';

//  API Endpoints 

const MEMPOOL_API = 'https://mempool.space/api';
const MEMPOOL_NINJA = 'https://mempool.ninja/api';

//  Fetch with Fallback 

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// Unified Esplora Fetcher
async function esploraFetch<T>(endpoint: string): Promise<T> {
  try {
    return await fetchJson<T>(`${MEMPOOL_API}${endpoint}`);
  } catch (err) {
    console.warn(`mempool.space API failed for ${endpoint}, falling back to mempool.ninja`);
    return await fetchJson<T>(`${MEMPOOL_NINJA}${endpoint}`);
  }
}

// Validate address format before using in API URLs
function assertSafeAddressParam(address: string): void {
  if (!address || typeof address !== 'string') {
    throw new Error('Invalid address: must be a non-empty string.');
  }
  // Only allow characters valid in Bitcoin addresses: alphanumeric
  if (!/^[a-zA-Z0-9]+$/.test(address)) {
    throw new Error('Invalid address: contains illegal characters.');
  }
}

export async function getAddressBalance(address: string): Promise<BalanceInfo> {
  assertSafeAddressParam(address);
  const data = await esploraFetch<any>(`/address/${address}`);
  const confirmed = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
  const unconfirmed = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;
  return { confirmed, unconfirmed, total: confirmed + unconfirmed };
}

export async function getUTXOs(address: string): Promise<UTXO[]> {
  assertSafeAddressParam(address);
  try {
    const raw = await esploraFetch<any[]>(`/address/${address}/utxo`);
    return raw.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status.confirmed,
      status: u.status,
    }));
  } catch (e) {
    return [];
  }
}

export async function getTransactionHistory(address: string): Promise<Transaction[]> {
  assertSafeAddressParam(address);
  try {
    const txs = await esploraFetch<any[]>(`/address/${address}/txs`);
    return txs.map((tx): Transaction => {
      let received = 0;
      let sent = 0;

      for (const vout of tx.vout) {
        if (vout.scriptpubkey_address === address) {
          received += vout.value;
        }
      }
      for (const vin of tx.vin) {
        if (vin.prevout?.scriptpubkey_address === address) {
          sent += vin.prevout.value;
        }
      }

      const value = received - sent;

      return {
        txid: tx.txid,
        confirmed: tx.status.confirmed,
        blockTime: tx.status.block_time ?? null,
        blockHeight: tx.status.block_height ?? null,
        fee: tx.fee,
        value,
        received,
        sent,
        type: value >= 0 ? 'received' : 'sent',
      };
    });
  } catch (err) {
    return [];
  }
}

export async function getRawTransaction(txid: string): Promise<string> {
  try {
    const res = await fetch(`${MEMPOOL_API}/tx/${txid}/hex`);
    if (res.ok) return await res.text();
  } catch (e) { }

  const res = await fetch(`${MEMPOOL_NINJA}/tx/${txid}/hex`);
  if (!res.ok) throw new Error('Failed to get raw hex');
  return await res.text();
}

export async function getFeeRates(): Promise<FeeRates> {
  const clamp = (rate: number) => Math.max(1, rate);

  // 1. Primary: mempool.space
  try {
    const data = await fetchJson<any>(`${MEMPOOL_API}/v1/fees/recommended`);
    if (data && data.hourFee) {
      return {
        fastestFee: clamp(data.fastestFee),
        halfHourFee: clamp(data.halfHourFee),
        hourFee: clamp(data.hourFee),
        economyFee: clamp(data.economyFee),
        minimumFee: clamp(data.minimumFee ?? 1),
      };
    }
  } catch { }

  // 2. Fallback: mempool.ninja
  try {
    const data = await fetchJson<any>(`${MEMPOOL_NINJA}/v1/fees/recommended`);
    if (data && data.hourFee) {
      return {
        fastestFee: clamp(data.fastestFee),
        halfHourFee: clamp(data.halfHourFee),
        hourFee: clamp(data.hourFee),
        economyFee: clamp(data.economyFee),
        minimumFee: clamp(data.minimumFee ?? 1),
      };
    }
  } catch { }

  // 3. Hardcoded Fallback
  return { fastestFee: 5, halfHourFee: 3, hourFee: 2, economyFee: 1, minimumFee: 1 };
}

export async function broadcastTransaction(rawTxHex: string): Promise<string> {
  const errors: string[] = [];

  // 1. Try mempool.space API
  try {
    const res = await fetch(`${MEMPOOL_API}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawTxHex,
    });
    if (res.ok) return (await res.text()).trim();
    errors.push(`Mempool API: ${await res.text()}`);
  } catch (err) {
    errors.push(`Mempool API: ${(err as Error).message}`);
  }

  // 2. Fallback: mempool.ninja
  try {
    const res = await fetch(`${MEMPOOL_NINJA}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawTxHex,
    });
    if (res.ok) return (await res.text()).trim();
    errors.push(`Mempool Ninja API: ${await res.text()}`);
  } catch (err) {
    errors.push(`Mempool Ninja API: ${(err as Error).message}`);
  }

  throw new Error(`Broadcast failed:\n${errors.join('\n')}`);
}

export async function getBtcPrice(): Promise<number> {
  // 1. Mempool.space (Fastest & natively trusted in our stack)
  try {
    const data = await fetchJson<any>(`${MEMPOOL_API}/v1/prices`);
    if (data && data.USD) return data.USD;
  } catch { }

  // 2. Blockchain.info (Highly reliable legacy fallback)
  try {
    const data = await fetchJson<any>('https://blockchain.info/ticker');
    if (data && data.USD && data.USD.last) return data.USD.last;
  } catch { }

  // 3. Binance Public API (Massive rate limits, extremely robust)
  try {
    const data = await fetchJson<any>('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    if (data && data.price) return parseFloat(data.price);
  } catch { }

  return 0;
}

//  Formatting Utilities 

export function satsToBtc(satoshis: number): string {
  return (satoshis / 1e8).toFixed(8);
}

export function btcToSats(btc: number | string): number {
  if (!btc || String(btc).trim() === '') return 0;
  const val = parseFloat(String(btc));
  if (isNaN(val)) return 0;
  return Math.round(val * 1e8);
}

export function formatBtc(satoshis: number): string {
  // Guard against NaN/undefined/Infinity
  if (satoshis == null || !Number.isFinite(satoshis)) return '0';
  const btc = (satoshis / 1e8).toFixed(8);
  return btc.replace(/\.?0+$/, '') || '0';
}

export function formatSats(satoshis: number): string {
  return satoshis.toLocaleString('en-US');
}

export function formatDate(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
