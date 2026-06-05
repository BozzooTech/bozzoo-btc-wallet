import { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import TopNav from '../components/TopNav';
import { state } from '../state';
import { getAddressBalance, formatBtc, btcToSats, formatSats, getFeeRates, getBtcPrice } from '../../engine/network';
import { deriveAddress } from '../../engine/wallet';
import { buildAndBroadcast, estimateFees, isValidBitcoinAddress, DONATION_ADDRESS } from '../../engine/transaction';
import { FeeSpeed, FeeRates, UTXO } from '../../types';
import ConfirmModal from '../components/ConfirmModal';
import GlobalHeader from '../components/GlobalHeader';
import { showAlert } from '../components/GlobalAlert';

export default function Send() {
  const { navigate, routeParams } = useContext(AppContext);
  const prefilledAddress: string = routeParams?.prefilledAddress || '';
  const isDonationMode: boolean = !!routeParams?.donationMode;
  const [currentAddress, setCurrentAddress] = useState('');
  const [balanceSats, setBalanceSats] = useState(0);

  const [sendMode, setSendMode] = useState<'single' | 'multi'>('single');
  const [recipients, setRecipients] = useState([{ address: prefilledAddress, amountStr: '' }]);
  const [useSats, setUseSats] = useState(false);
  const [isSendMax, setIsSendMax] = useState(false);
  const [feeSpeed, setFeeSpeed] = useState<FeeSpeed>('slow');

  const [utxos, setUtxosLocal] = useState<UTXO[] | null>(null);
  const [feeRates, setFeeRatesLocal] = useState<FeeRates | null>(null);
  const [feeEstimate, setFeeEstimate] = useState<any>(null);
  const [btcPriceUsd, setBtcPriceUsd] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError] = useState('');

  // Coin Control
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualSelection, setManualSelection] = useState<Set<string> | null>(null);

  // Donation
  const [donationUsd, setDonationUsd] = useState('');
  const [donationEnabled, setDonationEnabled] = useState(false);

  const init = async () => {
    try {
      const active = state.accounts?.find(a => a.id === state.activeAccountId);
      const accIndex = active?.accountIndex ?? 0;
      const xpub = state.unlockedXpubs[state.activeAccountId!]?.[state.currentAddressType];
      if (!xpub) throw new Error('Wallet locked');
      const addrInfo = await deriveAddress(xpub, state.currentAddressType, state.currentAddressIndex, accIndex);
      setCurrentAddress(addrInfo.address);
      const balInfo = await getAddressBalance(addrInfo.address);
      setBalanceSats(balInfo.total);
      const rates = await getFeeRates();
      setFeeRatesLocal(rates);
      const price = await getBtcPrice();
      setBtcPriceUsd(price);
    } catch (err) {
      console.error('Send init error', err);
    }
  };

  useEffect(() => { init(); }, []);

  // --- Derived values ---
  const totalAmountSatsParsed = isSendMax
    ? balanceSats
    : recipients.reduce((s, r) => s + (useSats ? parseInt(r.amountStr) || 0 : btcToSats(r.amountStr)), 0);

  // Donation sats conversion
  const donationSats = (() => {
    if (!donationUsd || !btcPriceUsd) return 0;
    const usd = parseFloat(donationUsd);
    if (isNaN(usd) || usd <= 0) return 0;
    const sats = Math.round((usd / btcPriceUsd) * 1e8);
    return sats;
  })();

  // Donation box always shown
  const showDonationBox = true;

  // Reset donation if turned off
  useEffect(() => {
    if (!donationEnabled) setDonationUsd('');
  }, [donationEnabled]);

  const handleSendMax = () => {
    if (sendMode !== 'single') return;
    setIsSendMax(true);
    setRecipients(prev => [{ ...prev[0], amountStr: useSats ? balanceSats.toString() : formatBtc(balanceSats).toString() }]);
  };

  const updateRecipient = (index: number, field: 'address' | 'amountStr', value: string) => {
    setRecipients(prev => {
      const newR = [...prev];
      newR[index] = { ...newR[index], [field]: value };
      return newR;
    });
    if (field === 'amountStr') setIsSendMax(false);
  };

  const addRecipient = () => {
    if (recipients.length >= 20) { showAlert('Maximum of 20 recipients allowed', 'error'); return; }
    setRecipients([...recipients, { address: '', amountStr: '' }]);
  };

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  // Build full recipients list (including optional donation)
  const buildFinalRecipients = (parsedRecipients: { address: string; amountSats: number }[]) => {
    const all = [...parsedRecipients];
    if (donationEnabled && donationSats > 0) {
      all.push({ address: DONATION_ADDRESS, amountSats: donationSats });
    }
    return all;
  };

  useEffect(() => {
    async function updateFees() {
      const validRecipients = recipients.filter(r => r.address.trim() && (r.amountStr || isSendMax));
      if (!currentAddress || validRecipients.length === 0 || !feeRates) { setFeeEstimate(null); return; }
      setIsEstimating(true);
      setErrorMsg('');
      try {
        const parsedRecipients = validRecipients.map(r => ({
          address: r.address.trim(),
          amountSats: isSendMax ? 0 : (useSats ? parseInt(r.amountStr) || 0 : btcToSats(r.amountStr))
        }));

        const minSats = btcPriceUsd ? Math.ceil((0.30 / btcPriceUsd) * 1e8) : 546;
        const seenAddresses = new Set<string>();
        for (const r of parsedRecipients) {
          if (!isValidBitcoinAddress(r.address)) throw new Error(`Invalid Bitcoin address: ${r.address}`);
          if (r.address === currentAddress) throw new Error('Cannot send to your own address.');
          if (seenAddresses.has(r.address)) throw new Error(`Duplicate recipient address.`);
          if (r.amountSats > 0 && r.amountSats < minSats) {
            throw new Error(`Amount too small. Minimum required is $0.30 (${minSats} sats / ${(minSats / 1e8).toFixed(8)} BTC)`);
          }
          seenAddresses.add(r.address);
        }

        const finalRecipients = buildFinalRecipients(parsedRecipients);
        const estimate = await estimateFees({
          fromAddress: currentAddress,
          fromAddressType: state.currentAddressType,
          recipients: finalRecipients,
          feeSpeed,
          sendMax: isSendMax,
          ...(utxos ? { utxos } : {}),
          ...(feeRates ? { feeRates } : {}),
          ...(manualSelection ? { selectedUtxoIds: Array.from(manualSelection) } : {})
        });
        setFeeEstimate(estimate);
      } catch (err: any) {
        let msg = err.message || 'Fee estimation failed';
        if (msg.includes('dust')) {
          const minSats = btcPriceUsd ? Math.ceil((0.30 / btcPriceUsd) * 1e8) : 546;
          msg = `Amount too small. Minimum required is $0.30 (${minSats} sats / ${(minSats / 1e8).toFixed(8)} BTC)`;
        }
        setErrorMsg(msg);
        setFeeEstimate(null);
      } finally {
        setIsEstimating(false);
      }
    }
    const timer = setTimeout(updateFees, 500);
    return () => clearTimeout(timer);
  }, [recipients, isSendMax, feeSpeed, useSats, manualSelection, currentAddress, feeRates, donationEnabled, donationUsd]);

  const handleSend = async () => {
    if (!feeEstimate?.canAfford) return;
    setShowConfirm(true);
  };

  const executeSend = async () => {
    setIsSending(true);
    setModalError('');
    try {
      const { decrypt } = await import('../../security/encryption');
      const { unlockWallet, verifyPasswordHash } = await import('../../engine/wallet');
      const isValid = await verifyPasswordHash(modalPassword);
      if (!isValid) throw new Error('Incorrect password');

      const active = state.accounts?.find(a => a.id === state.activeAccountId);
      const accIndex = active?.accountIndex ?? 0;
      const rootId = active?.parentId || active?.id;
      const rootAcc = state.accounts?.find(a => a.id === rootId);

      let decryptedSeed = '';
      if (rootAcc?.encryptedSeed) {
        decryptedSeed = await decrypt(JSON.parse(rootAcc.encryptedSeed), modalPassword);
      } else {
        const w = await unlockWallet(modalPassword);
        if (w) decryptedSeed = w;
      }
      if (!decryptedSeed) throw new Error('Failed to decrypt wallet');

      const rateMap = { slow: feeRates!.hourFee, medium: feeRates!.halfHourFee, fast: feeRates!.fastestFee };
      const validRecipients = recipients.filter(r => r.address.trim() && (r.amountStr || isSendMax));
      const parsedRecipients = validRecipients.map(r => ({
        address: r.address.trim(),
        amountSats: isSendMax ? 0 : (useSats ? parseInt(r.amountStr) || 0 : btcToSats(r.amountStr))
      }));

      const minSats = btcPriceUsd ? Math.ceil((0.30 / btcPriceUsd) * 1e8) : 546;
      const seenAddresses = new Set<string>();
      for (const r of parsedRecipients) {
        if (!isValidBitcoinAddress(r.address)) throw new Error(`Invalid Bitcoin address: ${r.address}`);
        if (r.address === currentAddress) throw new Error('Cannot send to your own address.');
        if (seenAddresses.has(r.address)) throw new Error(`Duplicate recipient address.`);
        if (r.amountSats > 0 && r.amountSats < minSats) {
          throw new Error(`Amount too small. Minimum required is $0.30 (${minSats} sats / ${(minSats / 1e8).toFixed(8)} BTC)`);
        }
        seenAddresses.add(r.address);
      }

      const finalRecipients = buildFinalRecipients(parsedRecipients);

      const result = await buildAndBroadcast({
        mnemonic: decryptedSeed,
        fromAddress: currentAddress,
        fromAddressType: state.currentAddressType,
        fromAddressIndex: state.currentAddressIndex,
        fromAccountIndex: accIndex,
        recipients: finalRecipients,
        feeRateSatVb: rateMap[feeSpeed],
        sendMax: isSendMax,
        ...(manualSelection ? { selectedUtxoIds: Array.from(manualSelection) } : {})
      });

      decryptedSeed = '0'.repeat(128);

      const totalAmountSats = parsedRecipients.reduce((s, r) => s + r.amountSats, 0);
      const finalAmount = isSendMax ? balanceSats - feeEstimate.totalFee : totalAmountSats;
      state.pendingTxs = state.pendingTxs || [];
      state.pendingTxs.push({ txid: result.txid, timestamp: Math.floor(Date.now() / 1000), type: 'sent', value: finalAmount });

      showAlert(`✓ Transaction sent! TXID: ${result.txid}`, 'success');
      setShowConfirm(false);
      setModalPassword('');
      navigate('dashboard');
    } catch (err: any) {
      let msg = err.message || 'Transaction failed';
      if (msg.includes('dust')) {
        const minSats = btcPriceUsd ? Math.ceil((0.30 / btcPriceUsd) * 1e8) : 546;
        msg = `Transaction rejected: Amount too small. Minimum required is $0.30 (${minSats} sats / ${(minSats / 1e8).toFixed(8)} BTC)`;
      }
      setModalError(msg);
    } finally {
      setIsSending(false);
    }
  };

  const totalAmountWithDonation = totalAmountSatsParsed + (donationEnabled ? donationSats : 0);
  const isInsufficient = (!isSendMax && totalAmountWithDonation > balanceSats) || (feeEstimate && !feeEstimate.canAfford);
  const totalFeeSats = feeEstimate?.totalFee || 0;
  const totalDeductedSats = isSendMax ? balanceSats : totalAmountWithDonation + totalFeeSats;
  const remainingAvailableSats = isSendMax ? 0 : Math.max(0, balanceSats - totalDeductedSats);

  const formatUsd = (sats: number) => {
    if (!btcPriceUsd || isNaN(sats) || !Number.isFinite(sats)) return '';
    return `($${((sats / 1e8) * btcPriceUsd).toFixed(2)})`;
  };

  return (
    <div className="page">
      <GlobalHeader onAccountChange={init} onRefresh={init} />
      <header className="page-header">
        <h2 className="page-header__title">{isDonationMode ? 'Donate' : 'Send Bitcoin'}</h2>
      </header>

      {isDonationMode && (
        <div style={{ margin: '0 16px 8px', padding: '10px 14px', background: 'rgba(247,148,26,0.1)', border: '1px solid rgba(247,148,26,0.35)', borderRadius: '8px', fontSize: '12px', color: 'var(--orange)', textAlign: 'center' }}>
          Donating to Bozzoo developer — thank you for your support!
        </div>
      )}

      <div style={{ padding: '24px 16px', flex: 1, overflowY: 'auto' }}>
        <div className="card card--glass">

          {/* Single / Multi tabs */}
          <div className="addr-tabs" style={{ marginBottom: '16px' }}>
            <button className={`addr-tab ${sendMode === 'single' ? 'addr-tab--active' : ''}`}
              onClick={() => { setSendMode('single'); setRecipients([{ address: '', amountStr: '' }]); setIsSendMax(false); }}>
              Single
            </button>
            <button className={`addr-tab ${sendMode === 'multi' ? 'addr-tab--active' : ''}`}
              onClick={() => { setSendMode('multi'); setRecipients([{ address: '', amountStr: '' }]); setIsSendMax(false); }}>
              Multiple
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Available: {formatSats(remainingAvailableSats)} sats &middot; {formatBtc(remainingAvailableSats)} BTC {formatUsd(remainingAvailableSats)}
            </div>
          </div>

          {recipients.map((recipient, idx) => (
            <div key={idx} style={{ marginBottom: '16px', padding: sendMode === 'multi' ? '12px' : '0', background: sendMode === 'multi' ? 'var(--bg-surface-2)' : 'transparent', borderRadius: '8px', border: sendMode === 'multi' ? '1px solid var(--border)' : 'none' }}>
              {sendMode === 'multi' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Recipient {idx + 1}</span>
                  {recipients.length > 1 && (
                    <button style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '12px' }} onClick={() => removeRecipient(idx)}>Remove</button>
                  )}
                </div>
              )}
              <div className="input-group" style={{ marginBottom: '8px' }}>
                <label className="input-label">Destination Address</label>
                <input className="input input--mono" placeholder="bc1q..." value={recipient.address}
                  onChange={e => updateRecipient(idx, 'address', e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Amount ({useSats ? 'sats' : 'BTC'})</label>
                <div className="input-with-action">
                  <input className={`input ${isInsufficient ? 'input--error' : ''}`} type="text" inputMode="decimal" placeholder="0.00"
                    value={recipient.amountStr} disabled={isSendMax && sendMode === 'single'}
                    onChange={e => {
                      let val = e.target.value.replace(/[^0-9.]/g, '');
                      if ((val.match(/\./g) || []).length > 1) val = val.substring(0, val.lastIndexOf('.'));
                      updateRecipient(idx, 'amountStr', val);
                    }} />
                  {sendMode === 'single' && <button className="input-with-action__btn" onClick={handleSendMax}>MAX</button>}
                </div>
              </div>
            </div>
          ))}

          {sendMode === 'multi' && (
            <button className="btn btn--outline" style={{ marginBottom: '16px', width: '100%', padding: '8px' }} onClick={addRecipient}>+ Add Recipient</button>
          )}

          {isInsufficient && (
            <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>Insufficient Funds</div>
          )}

          {/* Fee Speed */}
          <div className="input-group" style={{ marginBottom: '0' }}>
            <label className="input-label">Fee Speed</label>
            <div className="addr-tabs">
              {(['slow', 'medium', 'fast'] as FeeSpeed[]).map(speed => {
                const rateMap = { slow: feeRates?.hourFee ?? '...', medium: feeRates?.halfHourFee ?? '...', fast: feeRates?.fastestFee ?? '...' };
                const nameMap = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
                return (
                  <button key={speed} className={`addr-tab ${feeSpeed === speed ? 'addr-tab--active' : ''}`}
                    onClick={() => setFeeSpeed(speed)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px' }}>
                    <div className="addr-tab__label">{nameMap[speed]}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{rateMap[speed]} sat/vB</div>
                  </button>
                );
              })}
            </div>
            {feeRates && feeRates.fastestFee === feeRates.hourFee && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', background: 'var(--bg-surface-2)', padding: '6px', borderRadius: '4px' }}>
                Network congestion is low. All fee levels currently estimate the same rate.
              </div>
            )}
          </div>

          {/* Coin Control */}
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}
              onClick={() => setShowAdvanced(!showAdvanced)}>
              <span style={{ fontWeight: 600 }}>Advanced: Coin Control</span>
              <span>{showAdvanced ? '▲' : '▼'}</span>
            </div>
            {showAdvanced && feeEstimate?.utxos && (
              <div style={{ marginTop: '12px', background: 'var(--bg-surface-2)', borderRadius: '6px', padding: '8px' }}>
                {feeEstimate.utxos.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>No spendable UTXOs found.</div>
                ) : (
                  feeEstimate.utxos.map((u: UTXO) => {
                    const id = `${u.txid}:${u.vout}`;
                    const isChecked = manualSelection ? manualSelection.has(id) : true;
                    return (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                        <input type="checkbox" checked={isChecked} onChange={(e) => {
                          let newSel = manualSelection ? new Set<string>(manualSelection) : new Set<string>(feeEstimate.utxos.map((utxo: UTXO) => `${utxo.txid}:${utxo.vout}`));
                          if (e.target.checked) newSel.add(id); else newSel.delete(id);
                          setManualSelection(newSel);
                        }} />
                        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-mono)' }}>
                          {u.txid.slice(0, 8)}...{u.txid.slice(-6)}:{u.vout}
                        </div>
                        <div style={{ fontWeight: 600 }}>{formatSats(u.value)} sats</div>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Donation box */}
        {showDonationBox && (
          <div className="card card--glass" style={{ marginTop: '16px', border: '1px solid rgba(247,148,26,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '18px' }}>&#x2764;</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Donate</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Help add features & improve security — completely optional</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <input type="checkbox" checked={donationEnabled} onChange={e => {
                  setDonationEnabled(e.target.checked);
                  if (e.target.checked && (!donationUsd || parseFloat(donationUsd) < 0.3)) {
                    setDonationUsd('0.30');
                  }
                }}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--orange)', cursor: 'pointer' }} />
              </div>
            </div>
            {donationEnabled && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px' }}>$</span>
                  <input className="input" type="text" inputMode="decimal" placeholder="0.00" maxLength={8}
                    value={donationUsd}
                    onChange={e => {
                      let val = e.target.value.replace(/[^0-9.]/g, '');
                      if ((val.match(/\./g) || []).length > 1) val = val.substring(0, val.lastIndexOf('.'));
                      setDonationUsd(val);
                    }}
                    onBlur={() => {
                      if (donationUsd && parseFloat(donationUsd) < 0.3) {
                        setDonationUsd('0.30');
                      }
                    }}
                    style={{ paddingLeft: '24px' }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {donationSats > 0 ? `≈ ${formatSats(donationSats)} sats` : `min $0.30`}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fee breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          {(feeEstimate || isEstimating || errorMsg) && (
            <div className="card card--glass" style={{ marginTop: '16px', opacity: isEstimating ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: isEstimating ? 'none' : 'auto' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Transaction Breakdown</span>
                {isEstimating && <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderColor: 'var(--orange) transparent var(--orange) transparent' }}></div>}
              </div>

              {errorMsg && !isEstimating ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--red)', fontSize: '12px' }}>{errorMsg}</div>
              ) : feeEstimate ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Available Balance:</span>
                    <span style={{ fontWeight: 600 }}>{formatSats(feeEstimate.totalAvailable)} sats</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Network Fee:</span>
                    <span style={{ fontWeight: 600, color: 'var(--orange)' }}>{formatSats(feeEstimate.minerFee)} sats {formatUsd(feeEstimate.minerFee)}</span>
                  </div>
                  {donationEnabled && donationSats > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Donation:</span>
                      <span style={{ fontWeight: 600, color: 'var(--orange)' }}>{formatSats(donationSats)} sats {formatUsd(donationSats)}</span>
                    </div>
                  )}
                  {recipients.filter(r => r.address.trim()).map((r, idx) => {
                    const isMainRecipient = idx === 0;
                    const otherRecipientsTotal = recipients.slice(1).reduce((s, rec) => s + (useSats ? parseInt(rec.amountStr) || 0 : btcToSats(rec.amountStr)), 0);
                    const amtSats = (isSendMax && isMainRecipient)
                      ? Math.max(0, feeEstimate.totalAvailable - feeEstimate.minerFee - (donationEnabled && donationSats > 0 ? donationSats : 0) - otherRecipientsTotal)
                      : (useSats ? parseInt(r.amountStr) || 0 : btcToSats(r.amountStr));

                    if (amtSats <= 0 && !isSendMax) return null;

                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>To {r.address.slice(0, 8)}...{r.address.slice(-6)}:</span>
                        <span style={{ fontWeight: 600, color: 'var(--green)' }}>
                          {formatSats(amtSats)} sats {formatUsd(amtSats)}
                        </span>
                      </div>
                    );
                  })}
                  {feeEstimate.change > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Blance:</span>
                      <span style={{ fontWeight: 600, color: 'var(--green)' }}>{formatSats(feeEstimate.change)} sats</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
                    <span>Total Cost:</span>
                    <span>{formatSats(totalDeductedSats)} sats {formatUsd(totalDeductedSats)}</span>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '12px' }}>Estimating fees...</div>
              )}
            </div>
          )}
        </div>

        <button className={`btn btn--primary ${isSending ? 'btn--loading' : ''}`}
          style={{ marginTop: '24px' }}
          disabled={!feeEstimate?.canAfford || isInsufficient || isEstimating || recipients.every(r => !r.address)}
          onClick={handleSend}>
          Review & Send
        </button>
      </div>

      {feeEstimate && (
        <ConfirmModal isOpen={showConfirm} title="Confirm Transaction"
          message="Broadcast this transaction to the Bitcoin network?"
          confirmText="Send Transaction" onConfirm={executeSend} onCancel={() => setShowConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-surface-2)', padding: '12px', borderRadius: '8px' }}>
            {recipients.map((r, idx) => r.address.trim() ? (
              <div key={idx} style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>To:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{r.address.slice(0, 8)}...{r.address.slice(-8)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Amount:</span>
                  <span style={{ fontWeight: 600 }}>{isSendMax ? 'MAX' : formatBtc(useSats ? parseInt(r.amountStr) || 0 : btcToSats(r.amountStr))} BTC</span>
                </div>
              </div>
            ) : null)}
            {donationEnabled && donationSats > 0 && (
              <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--orange)' }}>☕ Donation:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{DONATION_ADDRESS.slice(0, 8)}...{DONATION_ADDRESS.slice(-6)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Amount:</span>
                  <span style={{ fontWeight: 600, color: 'var(--orange)' }}>{formatSats(donationSats)} sats {formatUsd(donationSats)}</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Network Fee:</span>
              <span style={{ fontWeight: 600 }}>~{formatBtc(feeEstimate.minerFee)} BTC</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Deducted:</span>
              <span style={{ fontWeight: 600 }}>{formatBtc(totalDeductedSats)} BTC</span>
            </div>
            <div style={{ marginTop: '16px' }}>
              <label className="input-label" style={{ color: 'var(--text-primary)' }}>Enter Password to Sign</label>
              <input type="password" className="input" placeholder="App Password"
                value={modalPassword} onChange={e => { setModalPassword(e.target.value); setModalError(''); }}
                disabled={isSending} />
              {modalError && <div style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px' }}>{modalError}</div>}
            </div>
          </div>
        </ConfirmModal>
      )}

      <TopNav />
    </div>
  );
}
