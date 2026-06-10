/**
 * Sweep.tsx - Full coin sweep workflow
 *
 * Flow:
 *  1. INTRO     - explain what sweep does
 *  2. PASSWORD  - unlock wallet (decrypt seed for multi-account derivation)
 *  3. SCANNING  - scan all accounts × address types with xpub batch UTXO API
 *  4. RESULTS   - show every address with balance clearly (no API calls here, data already fetched)
 *  5. CONFIGURE - enter destination address + fee speed
 *  6. CONFIRM   - final summary before signing
 *  7. PROGRESS  - building & broadcasting
 *  8. DONE      - TXID + amounts
 *
 * Safety guards:
 *  - Only confirmed UTXOs are included by default (unconfirmed flagged separately)
 *  - Dust (<546 sat) UTXOs shown but excluded from sweep to avoid waste
 *  - Fee calculated with 10% buffer; shown before confirmation
 *  - Net amount verified > 0 and > dust before proceeding
 *  - Mnemonic wiped immediately after all keys are derived
 */

import React, { useContext, useEffect, useState, useRef } from 'react';
import { AppContext } from '../App';
import TopNav from '../components/TopNav';
import { state } from '../state';
import { formatBtc, formatSats, getFeeRates, getBtcPrice } from '../../engine/network';
import { isValidBitcoinAddress, getDustThreshold } from '../../engine/transaction';
import { MAX_BIP32_INDEX } from '../../engine/wallet';
import type { AddressType, FeeRates } from '../../types';

// ─ Types ─

interface FoundUtxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
  address: string;
  path: string;
  addressType: AddressType;
  accountIndex: number;
  addressIndex: number;
  isDust: boolean;
}

interface FoundAddress {
  address: string;
  addressType: AddressType;
  accountIndex: number;
  addressIndex: number;
  totalBalance: number;
  confirmedBalance: number;
  unconfirmedBalance: number;
  utxos: FoundUtxo[];
  isDustOnly: boolean;
}

type Step = 'intro' | 'password' | 'scanning' | 'results' | 'configure' | 'confirm' | 'progress' | 'done';

const TYPE_LABEL: Record<AddressType, string> = {
  native_segwit: 'Native SegWit',
  taproot: 'Taproot',
  nested_segwit: 'Nested SegWit',
  legacy: 'Legacy',
};
const TYPE_ICON: Record<AddressType, React.ReactNode> = {
  native_segwit: <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>,
  taproot: <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  nested_segwit: <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  legacy: <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M8 8h6a3 3 0 0 1 0 6H8" /><path d="M8 14h6a3 3 0 0 1 0 6H8" /><path d="M11 5v14M14 5v14" /></svg>,
};

// ─ Component 

export default function Sweep() {
  const { navigate } = useContext(AppContext);

  //  Step state
  const [step, setStep] = useState<Step>('intro');

  //  Config
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([0]);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(99);
  const [gapLimit, setGapLimit] = useState(20);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const accountSelectorRef = useRef<HTMLDivElement>(null);
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<AddressType>>(
    new Set<AddressType>(['native_segwit'])
  );

  //  Password step
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  //  Scanning progress
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanPhase, setScanPhase] = useState('');

  //  Found data
  const [foundAddresses, setFoundAddresses] = useState<FoundAddress[]>([]);
  const [scanError, setScanError] = useState('');

  //  Configure step
  const [destination, setDestination] = useState('');
  const [destError, setDestError] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [feeRates, setFeeRates] = useState<FeeRates | null>(null);
  const [btcPrice, setBtcPrice] = useState(0);

  //  Progress / result
  const [progressPhase, setProgressPhase] = useState<'building' | 'signing' | 'broadcasting'>('building');
  const [txResult, setTxResult] = useState<{ txid: string; totalSwept: number; totalFee: number; utxoCount: number } | null>(null);
  const [sweepError, setSweepError] = useState('');
  const [isSweeping, setIsSweeping] = useState(false);

  useEffect(() => {
    getFeeRates().then(setFeeRates).catch(() => { });
    getBtcPrice().then(setBtcPrice).catch(() => { });

    const handleClickOutside = (event: MouseEvent) => {
      if (accountSelectorRef.current && !accountSelectorRef.current.contains(event.target as Node)) {
        setShowAccountSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const feeRateMap = {
    slow: feeRates?.hourFee ?? 2,
    medium: feeRates?.halfHourFee ?? 4,
    fast: feeRates?.fastestFee ?? 8,
  };
  const selectedFeeRate = feeRateMap[feeSpeed];

  const toggleType = (t: AddressType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) { if (next.size === 1) return prev; next.delete(t); }
      else next.add(t);
      return next;
    });
  };

  // Derived: which UTXOs will be included in the actual sweep
  const spendableAddresses = foundAddresses.filter(a =>
    !a.isDustOnly && (includeUnconfirmed ? a.totalBalance > 0 : a.confirmedBalance > 0)
  );
  const totalSpendableSats = spendableAddresses.reduce(
    (s, a) => s + (includeUnconfirmed ? a.totalBalance : a.confirmedBalance), 0
  );
  const totalSpendableUtxos = spendableAddresses.reduce(
    (s, a) => s + a.utxos.filter(u =>
      !u.isDust && (includeUnconfirmed ? true : u.confirmed)
    ).length, 0
  );

  // Fee estimate (rough, before building actual PSBT)
  // Using average input sizes per type; 10% buffer already in sweepAllCoins
  const INPUT_VBYTES: Record<AddressType, number> = {
    legacy: 148, nested_segwit: 91, native_segwit: 68, taproot: 58
  };
  const OUTPUT_VBYTES = 31;
  const TX_OVERHEAD = 10;
  const estimatedVbytes = TX_OVERHEAD + OUTPUT_VBYTES +
    spendableAddresses.reduce((s, a) =>
      s + a.utxos
        .filter(u => !u.isDust && (includeUnconfirmed ? true : u.confirmed))
        .reduce((ss) => ss + (INPUT_VBYTES[a.addressType] ?? 68), 0),
      0
    );
  const estimatedFee = Math.ceil(selectedFeeRate * estimatedVbytes * 1.1);
  const estimatedNet = totalSpendableSats - estimatedFee;

  const formatUsd = (sats: number) => {
    if (!btcPrice || sats <= 0) return '';
    return `≈ $${((sats / 1e8) * btcPrice).toFixed(2)}`;
  };

  //  STEP: Password → Scan ─
  const handleUnlockAndScan = async () => {
    setPasswordError('');
    if (!password) { setPasswordError('Password is required.'); return; }

    setStep('scanning');
    setScanError('');
    setFoundAddresses([]);

    try {
      const { verifyPasswordHash, unlockWallet, deriveAccountXpub, deriveAddress } = await import('../../engine/wallet');
      const { decrypt } = await import('../../security/encryption');
      const { getUTXOs } = await import('../../engine/network');

      // Verify password
      const isValid = await verifyPasswordHash(password);
      if (!isValid) {
        setPasswordError('Incorrect password.');
        setStep('password');
        return;
      }

      // Decrypt seed
      const active = state.accounts?.find(a => a.id === state.activeAccountId);
      const rootId = active?.parentId || active?.id;
      const rootWallet = state.accounts?.find(a => a.id === rootId);

      let mnemonic = '';
      if (rootWallet?.encryptedSeed) {
        mnemonic = await decrypt(JSON.parse(rootWallet.encryptedSeed), password);
      } else {
        const unlocked = await unlockWallet(password);
        if (unlocked) mnemonic = unlocked;
      }
      if (!mnemonic) throw new Error('Failed to decrypt wallet. Check your password.');

      //  Scanning using batch local derivation ─
      const types = Array.from(selectedTypes) as AddressType[];
      const maxPossibleCalls = types.length * selectedAccounts.length * (endIndex - startIndex + 1);
      setScanTotal(maxPossibleCalls);
      setScanProgress(0);

      const allFound: FoundAddress[] = [];
      let callsDone = 0;

      const { getAddressesBalances } = await import('../../engine/network');

      for (const addressType of types) {
        setScanPhase(`Scanning ${TYPE_LABEL[addressType]}…`);

        for (const accountIndex of selectedAccounts) {
          setScanPhase(`${TYPE_LABEL[addressType]} · Account ${accountIndex + 1}`);

          // Derive xpub for this account (requires mnemonic)
          const xpub = await deriveAccountXpub(mnemonic, addressType, accountIndex);

          let consecutiveEmpty = 0;
          const GAP_LIMIT = gapLimit;
          const CHUNK_SIZE = 50;

          for (let startIdx = startIndex; startIdx <= endIndex; startIdx += CHUNK_SIZE) {
            const chunkEndIdx = Math.min(startIdx + CHUNK_SIZE - 1, endIndex);

            // Derive addresses for chunk
            const chunkAddrs: { index: number, info: any }[] = [];
            const addressesToQuery: string[] = [];

            for (let addrIdx = startIdx; addrIdx <= chunkEndIdx; addrIdx++) {
              const info = await deriveAddress(xpub, addressType, addrIdx, accountIndex);
              chunkAddrs.push({ index: addrIdx, info });
              addressesToQuery.push(info.address);
            }

            // Fetch balances for entire chunk (1 api call)
            const balances = await getAddressesBalances(addressesToQuery);

            for (const item of chunkAddrs) {
              const bal = balances[item.info.address] || 0;

              if (bal === 0) {
                consecutiveEmpty++;
                callsDone++;
                setScanProgress(callsDone);
                if (consecutiveEmpty >= GAP_LIMIT) {
                  callsDone += (endIndex - item.index);
                  setScanProgress(callsDone);
                  break;
                }
              } else {
                consecutiveEmpty = 0;
                callsDone++;
                setScanProgress(callsDone);

                // Fetch specific UTXOs for this funded address
                const utxos = await getUTXOs(item.info.address);

                if (utxos.length > 0) {
                  const foundUtxos: FoundUtxo[] = utxos.map(u => ({
                    txid: u.txid,
                    vout: u.vout,
                    value: u.value,
                    confirmed: u.confirmed,
                    address: item.info.address,
                    path: `0/${item.index}`,
                    addressType,
                    accountIndex,
                    addressIndex: item.index,
                    isDust: u.value < getDustThreshold(addressType),
                  }));

                  const confirmedBalance = foundUtxos.filter(u => u.confirmed && !u.isDust).reduce((s, u) => s + u.value, 0);
                  const unconfirmedBalance = foundUtxos.filter(u => !u.confirmed && !u.isDust).reduce((s, u) => s + u.value, 0);
                  const totalBalance = foundUtxos.reduce((s, u) => s + u.value, 0);
                  const isDustOnly = foundUtxos.every(u => u.isDust);

                  allFound.push({
                    address: item.info.address,
                    addressType,
                    accountIndex,
                    addressIndex: item.index,
                    totalBalance,
                    confirmedBalance,
                    unconfirmedBalance,
                    utxos: foundUtxos,
                    isDustOnly,
                  });
                }
              }
            }

            if (consecutiveEmpty >= GAP_LIMIT) {
              await new Promise(r => setTimeout(r, 10));
              break;
            }
            await new Promise(r => setTimeout(r, 50));
          }
        }
      }

      // Wipe mnemonic
      mnemonic = '0'.repeat(128);

      // Sort: highest confirmed balance first
      allFound.sort((a, b) => b.confirmedBalance - a.confirmedBalance);
      setFoundAddresses(allFound);
      setStep('results');

    } catch (err: any) {
      setScanError(err.message || 'Scan failed.');
      setStep('results'); // show error on results page
    }
  };

  //  STEP: Execute Sweep ─
  const handleExecuteSweep = async () => {
    if (!destination || !isValidBitcoinAddress(destination.trim())) {
      setDestError('Invalid destination address.');
      return;
    }
    if (spendableAddresses.length === 0) {
      setSweepError('No spendable UTXOs to sweep.');
      return;
    }

    setStep('progress');
    setIsSweeping(true);
    setSweepError('');

    try {
      const { verifyPasswordHash, unlockWallet, deriveKeyPair } = await import('../../engine/wallet');
      const { decrypt } = await import('../../security/encryption');
      const { sweepAllCoins } = await import('../../engine/transaction');

      // Re-verify password before signing
      const isValid = await verifyPasswordHash(password);
      if (!isValid) throw new Error('Password verification failed. Please go back and try again.');

      const active = state.accounts?.find(a => a.id === state.activeAccountId);
      const rootId = active?.parentId || active?.id;
      const rootWallet = state.accounts?.find(a => a.id === rootId);

      let mnemonic = '';
      if (rootWallet?.encryptedSeed) {
        mnemonic = await decrypt(JSON.parse(rootWallet.encryptedSeed), password);
      } else {
        const unlocked = await unlockWallet(password);
        if (unlocked) mnemonic = unlocked;
      }
      if (!mnemonic) throw new Error('Failed to decrypt wallet.');

      setProgressPhase('building');

      const result = await sweepAllCoins(
        {
          mnemonic,
          destinationAddress: destination.trim(),
          addressTypes: Array.from(selectedTypes),
          selectedAccounts,
          startIndex,
          endIndex,
          gapLimit,
          feeRateSatVb: selectedFeeRate,
          skipDust: true,
        },
        (phase) => {
          if (phase === 'scanning') setProgressPhase('building');
          else if (phase === 'building') setProgressPhase('signing');
          else if (phase === 'broadcasting') setProgressPhase('broadcasting');
        }
      );

      mnemonic = '0'.repeat(128);

      setTxResult(result);
      setStep('done');

    } catch (err: any) {
      mnemonic_wipe_noop();
      setSweepError(err.message || 'Sweep failed. Please try again.');
      setStep('progress');
    } finally {
      setIsSweeping(false);
    }
  };

  function mnemonic_wipe_noop() { /* mnemonic local to handleExecuteSweep */ }

  //  Render 
  return (
    <div className="page">
      <header className="page-header">
        {step !== 'intro' && step !== 'done' && (
          <button className="page-header__back" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' }} onClick={() => {
            if (step === 'password') setStep('intro');
            else if (step === 'scanning') { }             // can't go back mid-scan
            else if (step === 'results') setStep('intro');
            else if (step === 'configure') setStep('results');
            else if (step === 'confirm') setStep('configure');
          }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
        )}
        <h2 className="page-header__title">Sweep Coins</h2>
        <div style={{ width: '34px' }} />
      </header>

      {/*  Step indicator ─ */}
      {!['progress', 'done'].includes(step) && (
        <div style={{ padding: '0 16px 8px', display: 'flex', gap: '4px' }}>
          {(['intro', 'password', 'results', 'configure', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              background: ['intro', 'password', 'scanning', 'results', 'configure', 'confirm'].indexOf(step) >= i
                ? 'var(--orange)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* 
            STEP 1: INTRO
         */}
        {step === 'intro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card card-glass" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '12px' }}><path d="M12 2v20M2 12h20M7 7l10 10M17 7l-10 10" /></svg>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>Coin Sweep</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Consolidate scattered Bitcoin from multiple accounts and addresses into a single destination to save on future fees.
              </p>
            </div>

            <div className="card card-glass">
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Scan Options</div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Address Types to Scan</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(['native_segwit', 'taproot', 'nested_segwit', 'legacy'] as AddressType[]).map(t => (
                    <button
                      key={t}
                      className={`btn btn-sm ${selectedTypes.has(t) ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => toggleType(t)}
                      style={{ fontSize: '11px' }}
                    >
                      {TYPE_ICON[t]} {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Accounts to Sweep</div>
                <div ref={accountSelectorRef} style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', minHeight: '36px', padding: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                  {selectedAccounts.map(accIdx => (
                    <div key={accIdx} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Account {accIdx + 1}
                      <svg onClick={(e) => { e.stopPropagation(); setSelectedAccounts(prev => prev.filter(a => a !== accIdx)); }} style={{ cursor: 'pointer', opacity: 0.7 }} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </div>
                  ))}
                  <input type="text" readOnly placeholder={selectedAccounts.length === 0 ? "Select accounts..." : ""} style={{ flex: 1, minWidth: '80px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }} onClick={() => setShowAccountSelector(true)} />
                  {showAccountSelector && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: '6px', zIndex: 10, boxShadow: 'var(--shadow-md)', maxHeight: '200px', overflowY: 'auto' }}>
                      <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--orange)', cursor: 'pointer', fontWeight: 600 }} onClick={() => { const active = state.accounts?.find(a => a.id === state.activeAccountId); const rootId = active?.parentId || active?.id; const allAccs = state.accounts?.filter(a => a.id === rootId || a.parentId === rootId) || []; setSelectedAccounts(allAccs.map(a => a.accountIndex ?? 0)); setShowAccountSelector(false); }}>Add All Accounts</div>
                      {(() => {
                        const active = state.accounts?.find(a => a.id === state.activeAccountId);
                        const rootId = active?.parentId || active?.id;
                        const allAccs = state.accounts?.filter(a => a.id === rootId || a.parentId === rootId) || [];
                        return allAccs.map(a => {
                          const accIdx = a.accountIndex ?? 0;
                          if (selectedAccounts.includes(accIdx)) return null;
                          return (
                            <div key={accIdx} style={{ padding: '8px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }} onClick={() => { setSelectedAccounts(prev => [...prev, accIdx]); setShowAccountSelector(false); }}>Account {accIdx + 1}</div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Start Index</label>
                  <input type="number" className="input" min={0} max={MAX_BIP32_INDEX} value={startIndex}
                    onChange={e => {
                      if (e.target.value === '') { setStartIndex(0); return; }
                      let val = parseInt(e.target.value, 10) || 0;
                      if (val > MAX_BIP32_INDEX) val = MAX_BIP32_INDEX;
                      setStartIndex(val);
                      e.target.value = val.toString();
                    }} style={{ padding: '6px 8px', fontSize: '13px' }} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>End Index</label>
                  <input type="number" className="input" min={0} max={MAX_BIP32_INDEX} value={endIndex}
                    onChange={e => {
                      if (e.target.value === '') { setEndIndex(0); return; }
                      let val = parseInt(e.target.value, 10) || 0;
                      if (val > MAX_BIP32_INDEX) val = MAX_BIP32_INDEX;
                      setEndIndex(val);
                      e.target.value = val.toString();
                    }} style={{ padding: '6px 8px', fontSize: '13px' }} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Gap Limit</label>
                  <input type="number" className="input" min={1} max={10000} value={gapLimit}
                    onChange={e => {
                      if (e.target.value === '') { setGapLimit(0); return; }
                      let val = parseInt(e.target.value, 10) || 0;
                      if (val > 10000) val = 10000;
                      setGapLimit(Math.max(1, val));
                      e.target.value = Math.max(1, val).toString();
                    }} style={{ padding: '6px 8px', fontSize: '13px' }} />
                </div>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '14px' }}
              onClick={() => setStep('password')}>
              Continue
            </button>
          </div>
        )}

        {/* 
            STEP 2: PASSWORD
         */}
        {step === 'password' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card card-glass" style={{ textAlign: 'center', padding: '20px' }}>
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '12px' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <h3 style={{ margin: '0 0 8px' }}>Unlock Wallet</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Your password is required to derive keys for scanning.
              </p>
            </div>

            <div className="card card-glass">
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">App Password</label>
                <input
                  type="password"
                  className={`input ${passwordError ? 'input-error' : ''}`}
                  placeholder="Enter your wallet password"
                  value={password}
                  autoFocus
                  onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleUnlockAndScan()}
                />
                {passwordError && <div className="input-error-msg">{passwordError}</div>}
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '14px' }}
              onClick={handleUnlockAndScan} disabled={!password || selectedTypes.size === 0}>
              Scan & Find Balances
            </button>
          </div>
        )}

        {/* 
            STEP 3: SCANNING
         */}
        {step === 'scanning' && (
          <div className="card card-glass" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div className="spinner" style={{ width: '48px', height: '48px', borderWidth: '4px', margin: '0 auto 24px' }} />
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Scanning Wallet…</div>
            <div style={{ fontSize: '13px', color: 'var(--orange)', marginBottom: '16px', minHeight: '20px' }}>{scanPhase}</div>

            {scanTotal > 0 && (
              <>
                <div style={{ height: '6px', background: 'var(--bg-surface-2)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (scanProgress / scanTotal) * 100)}%`,
                    background: 'linear-gradient(90deg, var(--orange), #f59e0b)',
                    borderRadius: '3px',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {scanProgress} / {scanTotal} account lookups
                </div>
              </>
            )}

          </div>
        )}

        {/* 
            STEP 4: RESULTS
         */}
        {step === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {scanError && (
              <div className="card card-glass" style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.05)' }}>
                <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: '6px' }}>Scan Error</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{scanError}</div>
                <button className="btn btn-ghost" style={{ marginTop: '12px' }} onClick={() => setStep('intro')}>Try Again</button>
              </div>
            )}

            {/* Summary bar */}
            {!scanError && (
              <div className="card card-glass" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--orange)' }}>
                    {formatBtc(totalSpendableSats)} BTC
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {formatUsd(totalSpendableSats)} · {totalSpendableUtxos} spendable UTXO{totalSpendableUtxos !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            )}

            {/* Unconfirmed toggle */}
            {foundAddresses.some(a => a.unconfirmedBalance > 0) && (
              <div className="card card-glass" style={{ padding: '12px 16px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Include Unconfirmed UTXOs</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Risky - unconfirmed UTXOs may be replaced. Only enable if you understand the implications.
                    </div>
                  </div>
                  <input type="checkbox" checked={includeUnconfirmed} onChange={e => setIncludeUnconfirmed(e.target.checked)} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                </label>
              </div>
            )}

            {/* Address list */}
            {foundAddresses.length === 0 && !scanError ? (
              <div className="card card-glass" style={{ textAlign: 'center', padding: '32px 20px' }}>
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '12px' }}><circle cx="12" cy="12" r="10" /><path d="M12 2v20M2 12h20M7 7l10 10M17 7l-10 10" /></svg>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No Balances Found</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  No UTXOs were found in the scanned range.
                </div>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} onClick={() => setStep('configure')}>
                  Configure Destination
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Addresses Found ({foundAddresses.length})
                </div>

                {foundAddresses.map((addr, idx) => (
                  <div key={idx} className="card card-glass" style={{
                    padding: '14px',
                    border: addr.isDustOnly
                      ? '1px solid rgba(107,114,128,0.3)'
                      : addr.confirmedBalance > 0
                        ? '1px solid rgba(34,197,94,0.3)'
                        : '1px solid rgba(247,148,26,0.3)',
                    opacity: addr.isDustOnly ? 0.6 : 1,
                  }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>
                          {TYPE_ICON[addr.addressType]} {TYPE_LABEL[addr.addressType]}
                          &nbsp;·&nbsp;Account {addr.accountIndex + 1}
                          &nbsp;·&nbsp;Index {addr.addressIndex}
                        </div>
                        {addr.isDustOnly && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-surface-2)', padding: '1px 6px', borderRadius: '3px', marginTop: '4px', display: 'inline-block' }}>
                            DUST ONLY - excluded
                          </span>
                        )}
                        {!addr.isDustOnly && addr.unconfirmedBalance > 0 && addr.confirmedBalance === 0 && (
                          <span style={{ fontSize: '10px', color: 'var(--orange)', background: 'rgba(247,148,26,0.1)', padding: '1px 6px', borderRadius: '3px', marginTop: '4px', display: 'inline-block' }}>
                            UNCONFIRMED
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: addr.isDustOnly ? 'var(--text-muted)' : 'var(--orange)' }}>
                          {formatBtc(addr.totalBalance)} BTC
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {formatUsd(addr.totalBalance)}
                        </div>
                      </div>
                    </div>

                    {/* Address */}
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: '8px', padding: '6px 8px', background: 'var(--bg-surface-2)', borderRadius: '4px' }}>
                      {addr.address}
                    </div>

                    {/* Balance breakdown */}
                    <div style={{ display: 'flex', gap: '16px', fontSize: '11px' }}>
                      {addr.confirmedBalance > 0 && (
                        <span style={{ color: 'var(--green)' }}>Confirmed: {formatSats(addr.confirmedBalance)} sats</span>
                      )}
                      {addr.unconfirmedBalance > 0 && (
                        <span style={{ color: 'var(--orange)' }}>Unconfirmed: {formatSats(addr.unconfirmedBalance)} sats</span>
                      )}
                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {addr.utxos.length} UTXO{addr.utxos.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Continue button */}
            {spendableAddresses.length > 0 && (
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '14px', marginTop: '4px' }}
                onClick={() => setStep('configure')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Continue - Set Destination <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </div>
              </button>
            )}
          </div>
        )}

        {/* 
            STEP 5: CONFIGURE
         */}
        {step === 'configure' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card card-glass">
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Destination Address</div>
              <input
                className={`input input-mono ${destError ? 'input-error' : ''}`}
                placeholder="bc1q…  or  bc1p…  (where all coins go)"
                value={destination}
                onChange={e => { setDestination(e.target.value); setDestError(''); }}
                onBlur={() => {
                  if (destination && !isValidBitcoinAddress(destination.trim())) {
                    setDestError('Invalid Bitcoin mainnet address.');
                  }
                }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              {destError && <div className="input-error-msg">{destError}</div>}
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                ⚠ Double-check this address. All {formatBtc(totalSpendableSats)} BTC will be sent here.
              </div>
            </div>

            {/* Fee speed */}
            <div className="card card-glass">
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Fee Speed</div>
              <div className="addr-tabs">
                {(['slow', 'medium', 'fast'] as const).map(speed => (
                  <button
                    key={speed}
                    className={`addr-tab ${feeSpeed === speed ? 'addr-tab-active' : ''}`}
                    onClick={() => setFeeSpeed(speed)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', flex: 1 }}
                  >
                    <div style={{ textTransform: 'capitalize', fontSize: '13px', fontWeight: 600 }}>{speed}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{feeRateMap[speed]} sat/vB</div>
                  </button>
                ))}
              </div>

              {/* Fee preview */}
              <div style={{ marginTop: '12px', padding: '10px', background: 'var(--bg-surface-2)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Input (sweep):</span>
                  <span style={{ fontWeight: 600 }}>{formatBtc(totalSpendableSats)} BTC ({formatUsd(totalSpendableSats)})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Est. fee:</span>
                  <span style={{ color: 'var(--orange)' }}>−{formatSats(estimatedFee)} sats ({formatUsd(estimatedFee)})</span>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ fontWeight: 700 }}>You receive:</span>
                  <span style={{ fontWeight: 800, color: estimatedNet > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {estimatedNet > 0 ? `${formatBtc(estimatedNet)} BTC` : 'Fee exceeds balance!'}
                  </span>
                </div>
              </div>
              {estimatedNet <= 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)' }}>
                  ⚠ The estimated fee exceeds your balance. Try selecting a slower (cheaper) fee speed.
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px' }}
              disabled={!destination || estimatedNet <= 0}
              onClick={() => {
                if (!destination.trim() || !isValidBitcoinAddress(destination.trim())) {
                  setDestError('Enter a valid Bitcoin mainnet address.');
                  return;
                }
                setStep('confirm');
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Review &amp; Confirm <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
            </button>
          </div>
        )}

        {/* 
            STEP 6: CONFIRM
         */}
        {step === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card card-glass">
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '16px' }}>Final Summary</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Addresses sweeping:</span>
                  <span style={{ fontWeight: 700 }}>{spendableAddresses.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total UTXOs:</span>
                  <span style={{ fontWeight: 700 }}>{totalSpendableUtxos}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total input:</span>
                  <span style={{ fontWeight: 700 }}>{formatBtc(totalSpendableSats)} BTC <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '4px' }}>{formatUsd(totalSpendableSats)}</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Fee rate:</span>
                  <span style={{ fontWeight: 700, color: 'var(--orange)' }}>{selectedFeeRate} sat/vB ({feeSpeed})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Est. fee:</span>
                  <span style={{ fontWeight: 700, color: 'var(--orange)' }}>{formatSats(estimatedFee)} sats <span style={{ opacity: 0.8, fontSize: '11px', marginLeft: '4px' }}>{formatUsd(estimatedFee)}</span></span>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '15px' }}>
                  <span style={{ fontWeight: 700 }}>Net received:</span>
                  <span style={{ fontWeight: 800, color: 'var(--green)' }}>{formatBtc(estimatedNet)} BTC <span style={{ opacity: 0.8, fontSize: '13px', marginLeft: '6px' }}>{formatUsd(estimatedNet)}</span></span>
                </div>
              </div>

              <div style={{ marginTop: '14px', padding: '10px', background: 'var(--bg-surface-2)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Destination:</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', wordBreak: 'break-all', color: 'var(--green)' }}>
                  {destination}
                </div>
              </div>
            </div>

            <div className="card card-glass" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
              <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 700, marginBottom: '6px' }}>⚠ This cannot be undone</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Once signed and broadcast, this transaction is final. Verify the destination address is correct and belongs to you.
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px' }}
              onClick={handleExecuteSweep}
              disabled={isSweeping}
            >
              Sign &amp; Broadcast Sweep
            </button>
          </div>
        )}

        {/* 
            STEP 7: PROGRESS
         */}
        {step === 'progress' && (
          <div className="card card-glass" style={{ textAlign: 'center', padding: '32px 20px' }}>
            {sweepError ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--red)', marginBottom: '12px' }}>Sweep Failed</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>{sweepError}</div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setSweepError(''); setStep('confirm'); }}>
                    Try Again
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => navigate('dashboard')}>
                    Dashboard
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="spinner" style={{ width: '48px', height: '48px', borderWidth: '4px', margin: '0 auto 24px' }} />
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
                  {progressPhase === 'building' && '🔨 Building Transaction…'}
                  {progressPhase === 'signing' && '✍️ Signing Inputs…'}
                  {progressPhase === 'broadcasting' && '📡 Broadcasting to Network…'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {progressPhase === 'building' && 'Constructing the PSBT with all discovered UTXOs as inputs.'}
                  {progressPhase === 'signing' && 'Deriving keypairs and signing each input individually.'}
                  {progressPhase === 'broadcasting' && 'Sending the signed transaction to the Bitcoin network.'}
                </div>
              </>
            )}
          </div>
        )}

        {/* 
            STEP 8: DONE
         */}
        {step === 'done' && txResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card card-glass" style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={{ fontSize: '56px', marginBottom: '12px' }}>✅</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--green)', marginBottom: '4px' }}>Sweep Complete!</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {txResult.utxoCount} UTXO{txResult.utxoCount !== 1 ? 's' : ''} consolidated into 1 transaction
              </div>
            </div>

            <div className="card card-glass">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Amount received:</span>
                  <span style={{ fontWeight: 800, color: 'var(--green)', fontSize: '15px' }}>
                    {formatBtc(txResult.totalSwept)} BTC
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Network fee paid:</span>
                  <span style={{ color: 'var(--orange)' }}>{formatSats(txResult.totalFee)} sats</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>USD value:</span>
                  <span>{formatUsd(txResult.totalSwept)}</span>
                </div>
              </div>

              <div style={{ marginTop: '14px', padding: '10px', background: 'var(--bg-surface-2)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Transaction ID:</div>
                <a
                  href={`https://mempool.space/tx/${txResult.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--orange)', wordBreak: 'break-all' }}
                >
                  {txResult.txid}
                </a>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '14px' }} onClick={() => navigate('dashboard')}>
              Back to Dashboard
            </button>
          </div>
        )}

      </div>
      <TopNav />
    </div>
  );
}
