import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../App';
import { state } from '../state';
import { validateMnemonic } from '../../engine/wallet';
import { DownloadIcon } from '../components/Icons';
import type { AddressType } from '../../types';

export default function Import() {
  const { navigate, goBack } = useContext(AppContext);
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [error, setError] = useState('');
  const [addressType, setAddressType] = useState<AddressType>('native_segwit');
  const [showSeed, setShowSeed] = useState(false);
  const [is24Words, setIs24Words] = useState(false);
  const [accountCount, setAccountCount] = useState(1);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...words];
    newWords[index] = value.toLowerCase().replace(/[^a-z]/g, '');
    setWords(newWords);
    setError('');
  };

  const handlePaste = (e: React.ClipboardEvent, index: number) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const pastedWords = pastedData.trim().toLowerCase().replace(/\s+/g, ' ').split(' ');
    
    if (pastedWords.length > 0) {
      // Auto-expand to 24 if needed
      if (pastedWords.length > 12 && !is24Words) {
        setIs24Words(true);
      }
      
      const targetLength = pastedWords.length > 12 || is24Words ? 24 : 12;
      const newWords = Array(targetLength).fill('');
      
      // Preserve existing words up to index, then paste, then keep remainder
      for (let i = 0; i < targetLength; i++) {
        if (i >= index && i < index + pastedWords.length) {
          newWords[i] = pastedWords[i - index].replace(/[^a-z]/g, '');
        } else if (i < words.length) {
          newWords[i] = words[i];
        }
      }
      
      setWords(newWords);
      setError('');
      
      // Focus the next empty input or the last one
      const nextIndex = Math.min(index + pastedWords.length, targetLength - 1);
      setTimeout(() => inputRefs.current[nextIndex]?.focus(), 50);
    }
  };

  const toggleLength = () => {
    if (is24Words) {
      setWords(words.slice(0, 12));
      setIs24Words(false);
    } else {
      setWords([...words, ...Array(12).fill('')]);
      setIs24Words(true);
    }
  };

  const handleContinue = () => {
    const phrase = words.join(' ').trim();
    if (words.some(w => !w)) {
      setError('Please fill in all words.');
      return;
    }
    if (!validateMnemonic(phrase)) {
      setError('Invalid recovery phrase. Please check your spelling.');
      return;
    }
    // Duplicate checking disabled for Cold Architecture (no plaintext seeds in memory)
    setError('');
    state.tempMnemonic = phrase;
    state.pendingAddressType = addressType;
    navigate('set-password', { accountCount });
  };

  return (
    <div className="page" style={{ background: 'var(--bg-base)' }}>
      <header className="page-header">
        <button className="page-header__back" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' }} onClick={goBack}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2 className="page-header__title">Import Wallet</h2>
        <div style={{ width: '34px' }}></div>
      </header>

      <div className="form-page">
        <div className="form-page__header">
          <div className="form-page__icon"><DownloadIcon /></div>
          <h2 className="form-page__title">Import with Seed</h2>
          <p className="form-page__subtitle">
            Enter your 12 or 24-word recovery phrase to restore your wallet. Paste into any box.
          </p>
        </div>



        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={toggleLength}>
              {is24Words ? 'Use 12 Words' : 'Use 24 Words'}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => setShowSeed(!showSeed)}>
              {showSeed ? 'Hide' : 'Show'}
            </button>
          </div>
          
          <div className="seed-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', padding: '12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
            {words.map((word, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '24px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                  {i + 1}
                </span>
                <input
                  ref={el => { inputRefs.current[i] = el; }}
                  className="input input-mono"
                  style={{ 
                    border: 'none', 
                    background: 'transparent', 
                    padding: '6px 8px', 
                    fontSize: '12px',
                    width: '100%',
                    WebkitTextSecurity: showSeed ? 'none' : 'disc' 
                  } as any}
                  value={word}
                  onChange={e => handleWordChange(i, e.target.value)}
                  onPaste={e => handlePaste(e, i)}
                  onKeyDown={e => {
                    if (e.key === 'Backspace' && word.length === 0 && i > 0) {
                      e.preventDefault();
                      inputRefs.current[i - 1]?.focus();
                    }
                    if (e.key === ' ' || e.code === 'Space') {
                      e.preventDefault();
                      if (i < words.length - 1) {
                        inputRefs.current[i + 1]?.focus();
                      }
                    }
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
            ))}
          </div>
          {error && <div className="input-error-msg">{error}</div>}
        </div>

        <div className="form-footer" style={{ marginTop: '24px' }}>
          <div className="input-group" style={{ marginBottom: '16px' }}>
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
          <button className="btn btn-primary" onClick={handleContinue} disabled={words.some(w => !w)}>
            Restore Wallet
          </button>
        </div>
      </div>
    </div>
  );
}
