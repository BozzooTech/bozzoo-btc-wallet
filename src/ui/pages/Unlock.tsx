import React, { useContext, useState } from 'react';
import { AppContext } from '../App';
import { state } from '../state';
import { getWalletConfig } from '../../engine/storage';
import { unlockWallet, clearWallet } from '../../engine/wallet';
import { clearSession, saveSessionToBackground } from '../state';
import { decrypt } from '../../security/encryption';
import ConfirmModal from '../components/ConfirmModal';

export default function Unlock() {
  const { navigate } = useContext(AppContext);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleUnlock = async () => {
    setLoading(true);
    setError('');
    try {
      let mnemonic = await unlockWallet(password);
      if (!mnemonic) throw new Error('Incorrect password');

      const config = await getWalletConfig();
      state.accounts = config.accounts;

      const rootMnemonics: Record<string, string> = {};

      for (const acc of config.accounts) {
        if (acc.encryptedSeed) {
          try {
            const blob = JSON.parse(acc.encryptedSeed);
            rootMnemonics[acc.id] = await decrypt(blob, password);
          } catch (e) {
            console.error('Failed to decrypt account seed', acc.id);
          }
        } else if (!acc.parentId) {
          rootMnemonics[acc.id] = mnemonic;
        }
      }

      const { ADDRESS_TYPES, deriveAccountXpub } = await import('../../engine/wallet');
      state.unlockedXpubs = {};
      
      for (const acc of config.accounts) {
        const targetMnemonic = acc.parentId ? rootMnemonics[acc.parentId] : rootMnemonics[acc.id];
        if (targetMnemonic) {
          state.unlockedXpubs[acc.id] = {} as any;
          for (const type of Object.values(ADDRESS_TYPES)) {
            state.unlockedXpubs[acc.id][type] = await deriveAccountXpub(targetMnemonic, type, acc.accountIndex);
          }
        }
      }

      // Securely overwrite the in-memory variables
      for (const key of Object.keys(rootMnemonics)) {
        rootMnemonics[key] = '0'.repeat(64);
      }
      mnemonic = '0'.repeat(64);

      state.activeAccountId = config.activeAccountId;
      const active = state.accounts?.find(a => a.id === state.activeAccountId) || state.accounts?.[0];
      if (active) {
        state.currentAddressType = active.addressType;
        state.currentAddressIndex = active.lastAddressIndex || 0;
      }

      saveSessionToBackground();
      navigate('dashboard');
    } catch (err: any) {
      setError('Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setShowConfirm(true);
  };

  const executeReset = async () => {
    await clearWallet();
    clearSession();
    navigate('welcome');
  };

  return (
    <div className="page" style={{ background: 'var(--bg-base)' }}>
      <div className="form-page" style={{ paddingTop: '32px' }}>
        <div className="form-page__header" style={{ marginBottom: '24px' }}>
          <img src="assets/icon.png" alt="Bozzoo Logo" style={{ width: '64px', height: '64px', marginBottom: '12px', filter: 'drop-shadow(0 4px 7px rgba(247, 148, 26, 0.68))' }} />
          <h2 className="form-page__title">Unlock Wallet</h2>
          <p className="form-page__subtitle">Enter your password to access your wallet</p>
        </div>

        <div className="input-group">
          <input
            type="password"
            className={`input ${error ? 'input-error' : ''}`}
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
          />
          {error && <div className="input-error-msg">{error}</div>}
        </div>

        <button
          className={`btn btn-primary ${loading ? 'btn-loading' : ''}`}
          style={{ marginTop: '16px', marginBottom: '16px' }}
          onClick={handleUnlock}
          disabled={!password || loading}
        >
          Unlock
        </button>

        <button
          className="btn btn-ghost"
          style={{ color: 'var(--text-muted)' }}
          onClick={handleReset}
        >
          Forgot Password? Reset Wallet
        </button>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="Reset Wallet"
        message="WARNING: Resetting will permanently delete your wallet from this device. You will need your 12-word seed phrase to restore your funds! Are you sure you want to proceed?"
        confirmText="Yes, Reset Wallet"
        onConfirm={executeReset}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
