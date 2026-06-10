/**
 * Bozzoo BTC Wallet - Transaction Builder (TypeScript)
 *
 * Builds, signs, and broadcasts Bitcoin PSBTs for all 4 address types.
 *
 * Coin selection : Largest-UTXO-first (greedy)
 * Fee estimation : Per-type vbyte sizes × fee rate
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import type { ECPairInterface } from "ecpair";
import { deriveKeyPair, toXOnly } from "./wallet";
import {
  getUTXOs,
  getRawTransaction,
  broadcastTransaction,
  getFeeRates,
} from "./network";
import type {
  AddressType,
  UTXO,
  FeeEstimate,
  SendParams,
  BroadcastResult,
  AddressValidation,
  FeeSpeed,
} from "../types/index";

const ECPair = ECPairFactory(ecc);
const NETWORK = bitcoin.networks.bitcoin;

// Developer donation address - used by the UI donation box (voluntary)
export const DONATION_ADDRESS = "bc1qqd7xeannn0ec8azp7xldc95q05uxfu7nlkkjzt";

//  Transaction Size Estimates (vbytes)

const INPUT_VBYTES: Record<AddressType, number> = {
  legacy: 148,
  nested_segwit: 91,
  native_segwit: 68,
  taproot: 58,
};

const OUTPUT_VBYTES: Record<string, number> = {
  legacy: 34,
  nested_segwit: 32,
  native_segwit: 31,
  taproot: 43,
};

const TX_OVERHEAD = 10; // vbytes

//  Internal Helpers

/**
 * Creates a tweaked signer for Taproot BIP-86 keypath spending.
 * @internal
 */
function createTaprootSigner(keyPair: ECPairInterface): ECPairInterface {
  const privateKey = keyPair.privateKey;
  if (!privateKey) throw new Error("Taproot signing requires a private key.");

  let sk = new Uint8Array(privateKey);
  if (keyPair.publicKey[0] === 3) {
    sk = new Uint8Array(ecc.privateNegate(sk) as Iterable<number>);
  }

  const xOnly = toXOnly(keyPair.publicKey);
  const tapTweakHash = bitcoin.crypto.taggedHash("TapTweak", xOnly);
  const tweaked = ecc.privateAdd(sk, tapTweakHash);

  if (!tweaked) throw new Error("Taproot key tweak produced an invalid key.");
  return ECPair.fromPrivateKey(Buffer.from(tweaked), { network: NETWORK });
}

/**
 * Detects the output script type of a Bitcoin address.
 * @internal
 */
function detectOutputType(address: string): string {
  if (address.startsWith("1")) return "legacy";
  if (address.startsWith("3")) return "nested_segwit";
  if (address.startsWith("bc1q")) return "native_segwit";
  if (address.startsWith("bc1p")) return "taproot";
  return "native_segwit";
}

/**
 * Returns the network dust limit for a given address type (in sats).
 * Outputs smaller than this will be rejected by the network.
 */
export function getDustThreshold(addressType: AddressType | string): number {
  switch (addressType) {
    case "taproot":
      return 330;
    case "native_segwit":
      return 294;
    case "nested_segwit":
      return 546;
    case "legacy":
      return 546;
    default:
      return 546;
  }
}

/**
 * Validates whether a given string is a valid Bitcoin mainnet address.
 */
export function isValidBitcoinAddress(address: string): boolean {
  try {
    bitcoin.address.toOutputScript(address, NETWORK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Estimates transaction size in virtual bytes.
 * @internal
 */
function estimateVbytes(
  inputCount: number,
  inputType: AddressType,
  outputTypes: string[],
  includeChange: boolean,
): number {
  const inputV = INPUT_VBYTES[inputType] ?? 68;
  const outputsV = outputTypes.reduce(
    (sum, type) => sum + (OUTPUT_VBYTES[type] ?? 31),
    0,
  );
  const changeV = OUTPUT_VBYTES[inputType] ?? 31;

  return (
    TX_OVERHEAD +
    inputCount * inputV +
    outputsV +
    (includeChange ? changeV : 0)
  );
}

interface TransactionPlan {
  selectedUTXOs: UTXO[];
  minerFee: number;
  totalFee: number;
  change: number;
  estimatedSize: number;
}

/**
 * Selects UTXOs and calculates miner fees.
 * @internal
 */
function calculateTransactionPlan(
  utxos: UTXO[],
  recipients: { address: string; amountSats: number }[],
  fromAddressType: AddressType,
  feeRateSatVb: number,
  sendMax: boolean,
): TransactionPlan {
  const outputTypes = recipients.map((r) => detectOutputType(r.address));
  let selectedUTXOs: UTXO[] = [];
  let totalIn = 0;
  let minerFee = 0;
  let estimatedSize = 0;

  if (sendMax) {
    selectedUTXOs = [...utxos];
    totalIn = selectedUTXOs.reduce((s, u) => s + u.value, 0);
    estimatedSize = estimateVbytes(
      Math.max(1, selectedUTXOs.length),
      fromAddressType,
      outputTypes,
      false,
    );
    minerFee = Math.ceil(feeRateSatVb * estimatedSize * 1.1);
  } else {
    const sorted = [...utxos].sort((a, b) => b.value - a.value);
    const totalAmountSats = recipients.reduce((s, r) => s + r.amountSats, 0);

    for (const utxo of sorted) {
      selectedUTXOs.push(utxo);
      totalIn += utxo.value;
      estimatedSize = estimateVbytes(
        selectedUTXOs.length,
        fromAddressType,
        outputTypes,
        true,
      );
      minerFee = Math.ceil(feeRateSatVb * estimatedSize * 1.1);

      if (totalIn >= totalAmountSats + minerFee) break;
    }
  }

  const totalAmountSats = recipients.reduce((s, r) => s + r.amountSats, 0);
  const change = sendMax
    ? 0
    : Math.max(0, totalIn - totalAmountSats - minerFee);

  const changeDustThreshold = getDustThreshold(fromAddressType);
  if (change > 0 && change < changeDustThreshold) {
    throw new Error(`Transaction creates dust change of ${change} sats which would be lost to miner fees. Please adjust your amount slightly or use Send Max.`);
  }

  return {
    selectedUTXOs,
    minerFee,
    totalFee: minerFee,
    change,
    estimatedSize,
  };
}

//  Public API

/**
 * Estimates fees for a proposed transaction without signing.
 */
export async function estimateFees(params: {
  fromAddress: string;
  fromAddressType: AddressType;
  recipients: { address: string; amountSats: number }[];
  feeSpeed?: FeeSpeed;
  sendMax?: boolean;
  selectedUtxoIds?: string[];
}): Promise<FeeEstimate> {
  const {
    fromAddress,
    fromAddressType,
    recipients,
    feeSpeed = "slow",
    sendMax = false,
    selectedUtxoIds,
  } = params;

  let [utxos, feeRates] = await Promise.all([
    getUTXOs(fromAddress),
    getFeeRates(),
  ]);

  if (selectedUtxoIds) {
    const selSet = new Set(selectedUtxoIds);
    utxos = utxos.filter((u: UTXO) => selSet.has(`${u.txid}:${u.vout}`));
  }

  const rateMap: Record<FeeSpeed, number> = {
    slow: feeRates.hourFee,
    medium: feeRates.halfHourFee,
    fast: feeRates.fastestFee,
  };
  const feeRate = rateMap[feeSpeed];
  const totalAvail = utxos.reduce((s, u) => s + u.value, 0);
  const totalAmountSats = recipients.reduce((s, r) => s + r.amountSats, 0);

  const isForcedSelection = !!selectedUtxoIds;
  const plan = calculateTransactionPlan(
    utxos,
    recipients,
    fromAddressType,
    feeRate,
    sendMax || isForcedSelection,
  );

  return {
    feeRate,
    estimatedSize: plan.estimatedSize,
    minerFee: plan.minerFee,
    totalFee: plan.totalFee,
    change: plan.change,
    totalAvailable: totalAvail,
    canAfford: sendMax
      ? totalAvail > plan.totalFee + recipients.slice(1).reduce((s, r) => s + r.amountSats, 0)
      : plan.selectedUTXOs.reduce((s, u) => s + u.value, 0) >=
      totalAmountSats + plan.totalFee,
    utxos,
  };
}

/**
 * Builds a signed PSBT and broadcasts it to the Bitcoin network.
 */
export async function buildAndBroadcast(
  params: SendParams,
): Promise<BroadcastResult> {
  const {
    mnemonic,
    fromAddress,
    fromAddressType,
    fromAddressIndex,
    fromAccountIndex = 0,
    recipients,
    feeRateSatVb,
    sendMax = false,
  } = params;

  if (!mnemonic) throw new Error("Wallet is locked. Unlock before sending.");
  if (!fromAddress) throw new Error("No sender address specified.");
  if (!recipients || recipients.length === 0)
    throw new Error("No recipients specified.");
  if (recipients.length > 20)
    throw new Error("Maximum of 20 recipients allowed per transaction.");

  // 1. Fetch UTXOs
  const allUTXOs = await getUTXOs(fromAddress);
  if (!allUTXOs.length) throw new Error("No spendable UTXOs on this address.");

  const totalAvailable = allUTXOs.reduce((s, u) => s + u.value, 0);

  // 2. Derive keypair (in-memory only, never stored)
  const keyPair = await deriveKeyPair(
    mnemonic,
    fromAddressType,
    fromAddressIndex,
    fromAccountIndex,
  );

  // 3. Calculate fees and select UTXOs
  const totalRequestedSats = recipients.reduce((s, r) => s + r.amountSats, 0);
  const plan = calculateTransactionPlan(
    allUTXOs,
    recipients,
    fromAddressType,
    feeRateSatVb,
    sendMax,
  );

  if (sendMax) {
    const otherRecipientsTotal = recipients.slice(1).reduce((s, r) => s + r.amountSats, 0);
    if (totalAvailable <= plan.totalFee + otherRecipientsTotal) {
      throw new Error("Insufficient funds to cover network fees and other outputs.");
    }
    recipients[0].amountSats = totalAvailable - plan.totalFee - otherRecipientsTotal;
  } else {
    const selectedInputTotal = plan.selectedUTXOs.reduce(
      (s, u) => s + u.value,
      0,
    );
    if (selectedInputTotal < totalRequestedSats + plan.totalFee) {
      const diff = totalRequestedSats + plan.totalFee - selectedInputTotal;
      throw new Error(`Insufficient funds. Need ${diff} more sats.`);
    }
  }

  // Network will reject if output is below its live dust threshold

  const selectedUTXOs = plan.selectedUTXOs;
  const change = plan.change;

  // 4. Build PSBT
  const psbt = new bitcoin.Psbt({ network: NETWORK });

  // Cache raw TXs for legacy inputs
  const rawTxCache: Record<string, string> = {};
  if (fromAddressType === "legacy") {
    await Promise.all(
      selectedUTXOs.map(async (utxo) => {
        if (!rawTxCache[utxo.txid]) {
          rawTxCache[utxo.txid] = await getRawTransaction(utxo.txid);
        }
      }),
    );
  }

  // Add inputs
  for (const utxo of selectedUTXOs) {
    const inputBase = {
      hash: utxo.txid,
      index: utxo.vout,
      sequence: 0xfffffffd,
    };

    switch (fromAddressType) {
      case "legacy": {
        psbt.addInput({
          ...inputBase,
          nonWitnessUtxo: Buffer.from(rawTxCache[utxo.txid], "hex"),
        });
        break;
      }
      case "nested_segwit": {
        const p2wpkh = bitcoin.payments.p2wpkh({
          pubkey: keyPair.publicKey,
          network: NETWORK,
        });
        const p2sh = bitcoin.payments.p2sh({
          redeem: p2wpkh,
          network: NETWORK,
        });
        if (!p2sh.output || !p2wpkh.output)
          throw new Error("Failed to build P2SH-P2WPKH script.");
        psbt.addInput({
          ...inputBase,
          witnessUtxo: { script: p2sh.output, value: utxo.value },
          redeemScript: p2wpkh.output,
        });
        break;
      }
      case "native_segwit": {
        const p2wpkh = bitcoin.payments.p2wpkh({
          pubkey: keyPair.publicKey,
          network: NETWORK,
        });
        if (!p2wpkh.output) throw new Error("Failed to build P2WPKH script.");
        psbt.addInput({
          ...inputBase,
          witnessUtxo: { script: p2wpkh.output, value: utxo.value },
        });
        break;
      }
      case "taproot": {
        const xOnly = toXOnly(keyPair.publicKey);
        const p2tr = bitcoin.payments.p2tr({
          internalPubkey: xOnly,
          network: NETWORK,
        });
        if (!p2tr.output) throw new Error("Failed to build P2TR script.");
        psbt.addInput({
          ...inputBase,
          witnessUtxo: { script: p2tr.output, value: utxo.value },
          tapInternalKey: xOnly,
        });
        break;
      }
      default: {
        const _e: never = fromAddressType;
        throw new Error(`Unsupported address type: ${String(_e)}`);
      }
    }
  }

  // Add recipient outputs
  for (const r of recipients) {
    psbt.addOutput({ address: r.address, value: r.amountSats });
  }

  // Change output
  if (change >= getDustThreshold(fromAddressType)) {
    psbt.addOutput({ address: fromAddress, value: change });
  }

  // 5. Sign all inputs
  for (let i = 0; i < selectedUTXOs.length; i++) {
    const signer =
      fromAddressType === "taproot" ? createTaprootSigner(keyPair) : keyPair;
    await psbt.signInputAsync(i, signer);
  }

  // 6. Finalize and extract
  psbt.finalizeAllInputs();
  const rawHex = psbt.extractTransaction().toHex();

  // 7. Broadcast
  const txid = await broadcastTransaction(rawHex);
  return { txid, rawHex };
}

/**
 * Validates a Bitcoin mainnet address.
 */
export function validateAddress(address: string): AddressValidation {
  if (!address?.trim()) {
    return { valid: false, type: null, error: "Address is required." };
  }

  const trimmed = address.trim();
  try {
    bitcoin.address.toOutputScript(trimmed, NETWORK);
  } catch {
    return {
      valid: false,
      type: null,
      error: "Invalid Bitcoin mainnet address.",
    };
  }

  let type: AddressType | null = null;
  if (trimmed.startsWith("1")) type = "legacy";
  else if (trimmed.startsWith("3")) type = "nested_segwit";
  else if (trimmed.startsWith("bc1q")) type = "native_segwit";
  else if (trimmed.startsWith("bc1p")) type = "taproot";

  return { valid: true, type, error: null };
}

//  Sweep Engine

/**
 * Represents a single UTXO together with the signing metadata needed for sweep.
 * @internal
 */
interface SweepUtxoEntry {
  txid: string;
  vout: number;
  value: number;
  addressType: AddressType;
  accountIndex: number;
  addressIndex: number;
  address: string;
  publicKey: Buffer;
}

/**
 * Scans all derivation paths for UTXOs, then consolidates them all into a
 * single transaction to a destination address.
 *
 * @param params.mnemonic             - Decrypted seed phrase (in-memory only; wiped after use)
 * @param params.destinationAddress   - Where to send all coins
 * @param params.addressTypes         - Which address types to scan
 * @param params.selectedAccounts     - Which account indices to scan
 * @param params.startIndex           - Start address index
 * @param params.endIndex             - End address index
 * @param params.feeRateSatVb         - Fee rate in sat/vB
 * @param params.skipDust             - Skip UTXOs below 546 sats (default true)
 * @param onProgress                  - Optional progress callback
 */
export async function sweepAllCoins(
  params: {
    mnemonic: string;
    destinationAddress: string;
    addressTypes: AddressType[];
    selectedAccounts: number[];
    startIndex: number;
    endIndex: number;
    gapLimit: number;
    feeRateSatVb: number;
    skipDust?: boolean;
  },
  onProgress?: (phase: 'scanning' | 'building' | 'broadcasting', scanned: number, total: number, found: number) => void
): Promise<{ txid: string; rawHex: string; totalSwept: number; totalFee: number; utxoCount: number }> {
  const {
    mnemonic,
    destinationAddress,
    addressTypes,
    selectedAccounts,
    startIndex,
    endIndex,
    gapLimit,
    feeRateSatVb,
    skipDust = true,
  } = params;

  if (!mnemonic) throw new Error("Wallet is locked.");
  if (!isValidBitcoinAddress(destinationAddress)) {
    throw new Error("Invalid destination address.");
  }

  const { deriveAccountXpub, deriveAddress, deriveKeyPair } = await import("./wallet");
  const { getUTXOs, getRawTransaction, broadcastTransaction, getAddressesBalances } = await import("./network");

  const totalAddresses = addressTypes.length * selectedAccounts.length * (endIndex - startIndex + 1);
  let scanned = 0;
  const collectedEntries: SweepUtxoEntry[] = [];

  // ── Phase 1: Scan ──────────────────────────────────────────────────────────
  for (const addressType of addressTypes) {
    for (const accountIndex of selectedAccounts) {
      const xpub = await deriveAccountXpub(mnemonic, addressType, accountIndex);

      let consecutiveEmpty = 0;
      const GAP_LIMIT = gapLimit;
      const CHUNK_SIZE = 50;

      for (let startIdx = startIndex; startIdx <= endIndex; startIdx += CHUNK_SIZE) {
        const chunkEndIdx = Math.min(startIdx + CHUNK_SIZE - 1, endIndex);

        const chunkAddrs: { index: number, info: any }[] = [];
        const addressesToQuery: string[] = [];

        for (let addrIdx = startIdx; addrIdx <= chunkEndIdx; addrIdx++) {
          const info = await deriveAddress(xpub, addressType, addrIdx, accountIndex);
          chunkAddrs.push({ index: addrIdx, info });
          addressesToQuery.push(info.address);
        }

        try {
          const balances = await getAddressesBalances(addressesToQuery);

          for (const item of chunkAddrs) {
            const bal = balances[item.info.address] || 0;

            if (bal === 0) {
              consecutiveEmpty++;
              scanned++;
              if (consecutiveEmpty >= GAP_LIMIT) {
                scanned += (endIndex - item.index);
                break;
              }
            } else {
              consecutiveEmpty = 0;
              scanned++;

              const utxos = await getUTXOs(item.info.address);
              for (const utxo of utxos) {
                // Real-time dust limit: skip if UTXO value is less than the fee cost to include it
                const inputVbytes = INPUT_VBYTES[addressType] ?? 68;
                const costToSpend = inputVbytes * feeRateSatVb;
                const dynamicDust = Math.max(getDustThreshold(addressType), costToSpend);

                if (skipDust && utxo.value < dynamicDust) continue;

                collectedEntries.push({
                  txid: utxo.txid,
                  vout: utxo.vout,
                  value: utxo.value,
                  addressType,
                  accountIndex,
                  addressIndex: item.index,
                  address: item.info.address,
                  publicKey: item.info.publicKey,
                });
              }
            }
            onProgress?.('scanning', scanned, totalAddresses, collectedEntries.length);
          }
        } catch {
          // Network error — skip
          scanned += (chunkEndIdx - startIdx + 1);
        }

        if (consecutiveEmpty >= GAP_LIMIT) break;
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  if (collectedEntries.length === 0) {
    throw new Error("No spendable UTXOs found across scanned addresses.");
  }

  // ── Phase 2: Build PSBT ───────────────────────────────────────────────────
  onProgress?.('building', scanned, totalAddresses, collectedEntries.length);

  const totalIn = collectedEntries.reduce((s, e) => s + e.value, 0);
  const destType = detectOutputType(destinationAddress);

  // Estimate fee: each entry may have a different input type
  // Group by address type for size estimation
  let estimatedSize = TX_OVERHEAD + (OUTPUT_VBYTES[destType] || 31);
  for (const entry of collectedEntries) {
    estimatedSize += INPUT_VBYTES[entry.addressType] ?? 68;
  }
  const fee = Math.ceil(feeRateSatVb * estimatedSize * 1.1);
  const netAmount = totalIn - fee;

  if (netAmount <= 0) {
    throw new Error(`Insufficient funds to cover network fee. Total: ${totalIn} sats, fee: ${fee} sats.`);
  }
  if (netAmount < getDustThreshold(destType)) {
    throw new Error(`Net amount after fee (${netAmount} sats) is below dust threshold for destination address.`);
  }

  const psbt = new bitcoin.Psbt({ network: NETWORK });

  // Cache raw TXs for legacy inputs (needed for non-segwit signing)
  const rawTxCache: Record<string, string> = {};
  const legacyEntries = collectedEntries.filter(e => e.addressType === "legacy");
  if (legacyEntries.length > 0) {
    await Promise.all(
      [...new Set(legacyEntries.map(e => e.txid))].map(async (txid) => {
        if (!rawTxCache[txid]) {
          rawTxCache[txid] = await getRawTransaction(txid);
        }
      })
    );
  }

  // Add inputs — each input needs its own keypair derived per-address
  const keyPairs: ECPairInterface[] = [];
  for (const entry of collectedEntries) {
    const kp = await deriveKeyPair(mnemonic, entry.addressType, entry.addressIndex, entry.accountIndex);
    keyPairs.push(kp);

    const inputBase = {
      hash: entry.txid,
      index: entry.vout,
      sequence: 0xfffffffd,
    };

    switch (entry.addressType) {
      case "legacy": {
        psbt.addInput({
          ...inputBase,
          nonWitnessUtxo: Buffer.from(rawTxCache[entry.txid], "hex"),
        });
        break;
      }
      case "nested_segwit": {
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: kp.publicKey, network: NETWORK });
        const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network: NETWORK });
        if (!p2sh.output || !p2wpkh.output) throw new Error("Failed to build P2SH-P2WPKH script.");
        psbt.addInput({
          ...inputBase,
          witnessUtxo: { script: p2sh.output, value: entry.value },
          redeemScript: p2wpkh.output,
        });
        break;
      }
      case "native_segwit": {
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: kp.publicKey, network: NETWORK });
        if (!p2wpkh.output) throw new Error("Failed to build P2WPKH script.");
        psbt.addInput({
          ...inputBase,
          witnessUtxo: { script: p2wpkh.output, value: entry.value },
        });
        break;
      }
      case "taproot": {
        const xOnly = toXOnly(kp.publicKey);
        const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: NETWORK });
        if (!p2tr.output) throw new Error("Failed to build P2TR script.");
        psbt.addInput({
          ...inputBase,
          witnessUtxo: { script: p2tr.output, value: entry.value },
          tapInternalKey: xOnly,
        });
        break;
      }
    }
  }

  // Single output to destination
  psbt.addOutput({ address: destinationAddress, value: netAmount });

  // ── Phase 3: Sign each input with its derived keypair ─────────────────────
  for (let i = 0; i < collectedEntries.length; i++) {
    const entry = collectedEntries[i];
    const kp = keyPairs[i];
    const signer = entry.addressType === "taproot" ? createTaprootSigner(kp) : kp;
    await psbt.signInputAsync(i, signer);
  }

  psbt.finalizeAllInputs();
  const rawHex = psbt.extractTransaction().toHex();

  // ── Phase 4: Broadcast ────────────────────────────────────────────────────
  onProgress?.('broadcasting', scanned, totalAddresses, collectedEntries.length);
  const txid = await broadcastTransaction(rawHex);

  return {
    txid,
    rawHex,
    totalSwept: netAmount,
    totalFee: fee,
    utxoCount: collectedEntries.length,
  };
}
