import React, { useContext, useEffect, useState, useRef } from 'react';
import { AppContext } from '../App';
import TopNav from '../components/TopNav';
import { state } from '../state';
import { getAddressBalance, getTransactionHistory, formatBtc, getBtcPrice, btcToSats } from '../../engine/network';
import { deriveAddress } from '../../engine/wallet';
import { getWalletConfig, saveWalletConfig } from '../../engine/storage';
import { Transaction } from '../../types';
import GlobalHeader from '../components/GlobalHeader';

export default function Dashboard() {
  const { navigate } = useContext(AppContext);
  const [balanceSats, setBalanceSats] = useState<number>(0);
  const [fiatValue, setFiatValue] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentAddress, setCurrentAddress] = useState<string>('');

  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanRange, setScanRange] = useState(10);
  const [scanResults, setScanResults] = useState<{ index: number, address: string, balance: number }[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const [pollIntervalMs, setPollIntervalMs] = useState<number>(30000);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);



  const loadData = async () => {
    setLoading(true);
    try {
      const active = state.accounts?.find(a => a.id === state.activeAccountId);
      const accIndex = active?.accountIndex ?? 0;

      const xpub = state.unlockedXpubs[state.activeAccountId!]?.[state.currentAddressType];
      if (!xpub) throw new Error('Wallet locked or xpub missing');

      const addrInfo = await deriveAddress(
        xpub,
        state.currentAddressType,
        state.currentAddressIndex,
        accIndex
      );
      setCurrentAddress(addrInfo.address);

      const [balInfo, price, txs] = await Promise.all([
        getAddressBalance(addrInfo.address),
        getBtcPrice(),
        getTransactionHistory(addrInfo.address)
      ]);

      setBalanceSats(balInfo.confirmed);
      setFiatValue((balInfo.confirmed / 100_000_000) * price);
      setTransactions(txs);

      setPollIntervalMs(30000);
      setIsRateLimited(false);
      setIsOffline(false);
    } catch (err: any) {
      console.error('Dashboard load error', err);
      if (err.message && err.message.includes('429')) {
        setIsRateLimited(true);
        setIsOffline(false);
        setPollIntervalMs(30 * 60 * 1000);
      } else if (!navigator.onLine) {
        setIsRateLimited(false);
        setIsOffline(true);
        setPollIntervalMs(5000); // Retry every 5s to auto-update when connected
      } else {
        // Some other fetch error like 500
        setIsRateLimited(false);
        setIsOffline(false);
        setPollIntervalMs(30000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [state.currentAddressType, state.activeAccountId, state.currentAddressIndex]);

  useEffect(() => {
    if (pollIntervalMs > 0) {
      const interval = setInterval(loadData, pollIntervalMs);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [state.currentAddressType, state.activeAccountId, state.currentAddressIndex, pollIntervalMs]);

  // Merge pending transactions with confirmed/network transactions
  const displayTransactions = [...transactions];
  if (state.pendingTxs && state.pendingTxs.length > 0) {
    state.pendingTxs.forEach(ptx => {
      // Don't duplicate if the network already picked it up
      if (!displayTransactions.some(t => t.txid === ptx.txid)) {
        displayTransactions.unshift({
          txid: ptx.txid,
          confirmed: false,
          blockTime: ptx.timestamp,
          blockHeight: null,
          fee: 0,
          value: ptx.type === 'sent' ? -ptx.value : ptx.value,
          received: ptx.type === 'received' ? ptx.value : 0,
          sent: ptx.type === 'sent' ? ptx.value : 0,
          type: ptx.type
        });
      }
    });
  }
  // Sort: Unconfirmed always at the top, then by time descending
  displayTransactions.sort((a, b) => {
    if (a.confirmed !== b.confirmed) {
      return a.confirmed ? 1 : -1;
    }
    return (b.blockTime || 0) - (a.blockTime || 0);
  });

  const btcBalance = formatBtc(balanceSats);
  const activeAccount = state.accounts?.find(a => a.id === state.activeAccountId);
  const accountName = activeAccount?.name || 'Default Wallet';

  const copyAddress = () => {
    navigator.clipboard.writeText(currentAddress);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 1000);
  };

  const copyTxid = (e: React.MouseEvent, txid: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(txid);
    setCopiedTx(txid);
    setTimeout(() => setCopiedTx(null), 2000);
  };



  const runScanner = async () => {
    setIsScanning(true);
    setScanResults([]);
    try {
      const active = state.accounts?.find(a => a.id === state.activeAccountId);
      const accIndex = active?.accountIndex ?? 0;

      const results = [];
      const xpub = state.unlockedXpubs[state.activeAccountId!]?.[state.currentAddressType];
      if (!xpub) throw new Error('Wallet locked');

      for (let i = 0; i <= scanRange; i++) {
        const info = await deriveAddress(xpub, state.currentAddressType, i, accIndex);
        const bal = await getAddressBalance(info.address);
        if (bal.total > 0) {
          results.push({ index: i, address: info.address, balance: bal.total });
          setScanResults([...results]); // update progressively
        }
      }
      if (results.length === 0) {
        setScanResults([{ index: -1, address: 'No balances found in this range.', balance: 0 }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="page">
      <GlobalHeader onAccountChange={loadData} onRefresh={loadData} />

      {isRateLimited && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '12px 16px', fontSize: '13px', textAlign: 'center', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
          Auto-refresh paused for 30 minutes. You can manually refresh anytime.
        </div>
      )}

      {isOffline && !isRateLimited && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--orange)', padding: '12px 16px', fontSize: '13px', textAlign: 'center', borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>
          Network disconnected. Waiting for connection...
        </div>
      )}

      {/* Balance Card */}
      <div style={{ padding: '24px 16px 16px' }}>
        <div className="card card--glass" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Available Balance
          </div>
          <div style={{ fontSize: '36px', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
            {btcBalance} <span style={{ fontSize: '20px', color: 'var(--orange)' }}>BTC</span>
          </div>
          <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px' }}>
            ${fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {balanceSats.toLocaleString()} sats
          </div>

          <div
            className="address-display"
            style={{
              marginTop: '24px', cursor: 'pointer', padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}
            onClick={copyAddress}
          >
            <div className="address-display__text" style={{ wordBreak: 'break-all', fontSize: '12px', lineHeight: '1.4', textAlign: 'center' }}>
              {currentAddress}
            </div>
            {copiedAddr && (
              <div style={{ fontSize: '12px', color: 'var(--green)', marginTop: '8px', fontWeight: 600 }}>
                Copied!
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button className="btn btn--primary" onClick={() => navigate('send')}>Send</button>
            <button className="btn btn--secondary" onClick={() => navigate('receive')}>Receive</button>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div style={{ padding: '0 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 className="section-label">Recent Transactions</h3>
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="tx-list" style={{ overflowY: 'auto', flex: 1 }}>
            {loading && displayTransactions.length === 0 ? (
              <div className="tx-empty"><div className="spinner"></div></div>
            ) : displayTransactions.length === 0 ? (
              <div className="tx-empty">
                <div className="tx-empty__icon">
                  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div className="tx-empty__text">No transactions found for this address.</div>
              </div>
            ) : (
              displayTransactions.map(tx => {
                const isSent = tx.type === 'sent';
                const date = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isCopied = copiedTx === tx.txid;
                const isPending = !tx.confirmed;

                return (
                  <a key={tx.txid} href={`https://mempool.space/tx/${tx.txid}`} target="_blank" rel="noopener noreferrer" className="tx-item">
                    <div className={`tx-icon ${isSent ? 'tx-icon--sent' : 'tx-icon--received'}`} style={{ position: 'relative' }}>
                      {isSent ? (
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
                      ) : (
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                      )}
                      {isPending && (
                        <div style={{ position: 'absolute', inset: -4, border: '2px solid transparent', borderTopColor: 'var(--orange)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      )}
                    </div>
                    <div className="tx-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="tx-txid" style={{ color: 'var(--text-primary)' }}>
                          {isPending ? (isSent ? 'Sending...' : 'Pending Receive...') : (isSent ? 'Sent' : 'Received')}
                        </div>
                        <button
                          className={`copy-btn ${isCopied ? 'copy-btn--copied' : ''}`}
                          style={{ padding: '0', background: 'transparent' }}
                          onClick={(e) => copyTxid(e, tx.txid)}
                          title="Copy TXID"
                        >
                          {isCopied ? (
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                          ) : (
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                          )}
                        </button>
                      </div>
                      <div className="tx-date">{isPending ? <span style={{ color: 'var(--yellow)' }}>Pending Confirmation...</span> : `${timeStr} \u00B7 ${date.toLocaleDateString()}`}</div>
                    </div>
                    <div className="tx-amount">
                      <div className={`tx-amount__btc ${isSent ? 'tx-amount__btc--sent' : 'tx-amount__btc--received'}`}>
                        {isSent ? '-' : '+'}{formatBtc(Math.abs(tx.value))}
                      </div>
                      <div className="tx-amount__status" style={{ color: isPending ? 'var(--yellow)' : 'var(--green)' }}>
                        {isPending ? 'Pending' : 'Confirmed'}
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showScanner && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '90%', maxWidth: '400px' }}>
            <h3 style={{ marginTop: 0 }}>Wallet Index Scanner</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Scan the blockchain for addresses with balances starting from index 0.
            </p>

            <div className="input-group">
              <label className="input-label">Max Index to Scan</label>
              <input
                type="number"
                className="input"
                value={scanRange}
                onChange={e => setScanRange(Number(e.target.value) || 10)}
                max="100"
              />
            </div>

            <div style={{ marginTop: '16px', maxHeight: '150px', overflowY: 'auto', background: 'var(--bg-surface-2)', padding: '8px', borderRadius: '4px' }}>
              {isScanning ? (
                <div style={{ textAlign: 'center', padding: '16px' }}><div className="spinner"></div></div>
              ) : scanResults.length === 0 ? (
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Click Scan to start searching.</div>
              ) : (
                scanResults.map((r, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                    {r.index >= 0 ? (
                      <>
                        <span>Index {r.index}</span>
                        <span style={{ color: 'var(--orange)' }}>{formatBtc(r.balance)} BTC</span>
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            state.currentAddressIndex = r.index;
                            setShowScanner(false);
                            loadData();
                          }}
                        >Jump</button>
                      </>
                    ) : (
                      <span>{r.address}</span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => setShowScanner(false)}>Close</button>
              <button className="btn btn--primary" style={{ flex: 1 }} onClick={runScanner} disabled={isScanning}>
                {isScanning ? 'Scanning...' : 'Start Scan'}
              </button>
            </div>
          </div>
        </div>
      )}
      <TopNav />
    </div>
  );
}
