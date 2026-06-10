import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../App';
import { generateMnemonic } from '../../engine/wallet';
import { state } from '../state';
import { PadlockIcon } from '../components/Icons';
import type { AddressType } from '../../types';

export default function Create() {
  const { navigate, goBack } = useContext(AppContext);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [addressType, setAddressType] = useState<AddressType>('native_segwit');
  const [accountCount, setAccountCount] = useState(1);
  
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Generate standard 12-word BIP39 mnemonic
    const m = generateMnemonic(128); 
    setMnemonic(m.split(' '));
  }, []);

  const handleContinue = () => {
    state.tempMnemonic = mnemonic.join(' ');
    state.pendingAddressType = addressType;
    navigate('set-password', { accountCount });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonic.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page" style={{ background: 'var(--bg-base)' }}>
      <header className="page-header">
        <button className="page-header__back" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' }} onClick={goBack}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2 className="page-header__title">Recovery Phrase</h2>
        <div style={{ width: '34px' }}></div>
      </header>

      <div className="form-page">
        <div className="form-page__header">
          <div className="form-page__icon"><PadlockIcon /></div>
          <h2 className="form-page__title">Secret Recovery Phrase</h2>
          <p className="form-page__subtitle">
            Write down these 12 words in order. Keep them safe. If you lose them, your funds will be lost forever.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSeed(!showSeed)}>
            {showSeed ? 'Hide Phrase' : 'Show Phrase'}
          </button>
          <button className={`btn btn-ghost btn-sm ${copied ? 'copy-btn-copied' : ''}`} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy All'}
          </button>
        </div>

        <div className="seed-grid" style={{ filter: showSeed ? 'none' : 'blur(4px)', transition: 'filter 0.3s' }}>
          {mnemonic.map((word, i) => (
            <div key={i} className="seed-word">
              <span className="seed-word__num">{i + 1}.</span>
              <span className="seed-word__text">{word}</span>
            </div>
          ))}
        </div>
        {!showSeed && (
          <div style={{ position: 'relative', top: '-110px', textAlign: 'center', pointerEvents: 'none', color: 'var(--text-primary)', fontWeight: 'bold' }}>
            Click "Show Phrase" to reveal
          </div>
        )}

        <label className="checkbox-row" style={{ marginTop: showSeed ? '16px' : '-24px' }}>
          <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />
          <span>I have securely saved these 12 words</span>
        </label>

        <div className="input-group" style={{ marginTop: '16px' }}>
          <label className="input-label">Number of accounts to create (default: 1)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={accountCount}
              onChange={e => setAccountCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              style={{ width: '80px' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {accountCount === 1 ? 'Creates 1 account (Account 1)' : `Creates ${accountCount} accounts (Account 1–${accountCount})`}
            </span>
          </div>
        </div>



        <div className="form-footer" style={{ marginTop: '24px' }}>
          <button className="btn btn-primary" disabled={!saved} onClick={handleContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
