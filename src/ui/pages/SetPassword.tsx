import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import { state, clearPending, saveSessionToBackground } from '../state';
import { saveWalletConfig } from '../../engine/storage';
import { createWallet, verifyPasswordHash as verifyPassword } from '../../engine/wallet';
import { encrypt } from '../../security/encryption';
import { KeyIcon } from '../components/Icons';

export default function SetPassword() {
  const { navigate, goBack } = useContext(AppContext);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  const isAddingAccount = state.accounts && state.accounts.length > 0;

  useEffect(() => {
    if (isAddingAccount) {
      setBackedUp(true); // Don't require backup checkbox if just verifying password for existing app
    }
  }, [isAddingAccount]);

  const handleCreate = async () => {
    if (!isAddingAccount && password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (!isAddingAccount && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (!state.tempMnemonic) throw new Error('Mnemonic lost in state');

      const isValid = await verifyPassword(password);
      if (!isValid) {
        throw new Error('Incorrect password');
      }

      const newAccountId = crypto.randomUUID();
      const addrType = state.pendingAddressType || 'native_segwit';
      const rootWalletsCount = state.accounts?.filter(a => !a.parentId).length || 0;
      const name = isAddingAccount ? `Wallet ${rootWalletsCount + 1}` : 'Wallet 1';

      const { ADDRESS_TYPES, deriveAccountXpub } = await import('../../engine/wallet');

      if (isAddingAccount) {
        const testXpub = await deriveAccountXpub(state.tempMnemonic, 'native_segwit', 0);
        let duplicateFound = false;
        if (state.unlockedXpubs) {
          for (const [id, xpubs] of Object.entries(state.unlockedXpubs)) {
            if (xpubs && xpubs['native_segwit'] === testXpub) {
              const acc = state.accounts?.find(a => a.id === id);
              if (acc && !acc.parentId) {
                duplicateFound = true;
                break;
              }
            }
          }
        }
        if (duplicateFound) {
          throw new Error('This wallet has already been imported.');
        }
      }

      if (!isAddingAccount) {
        // First time setup
        await createWallet(password, state.tempMnemonic);
        
        state.accounts = [
          {
            id: newAccountId,
            name,
            addressType: addrType,
            accountIndex: 0
          }
        ];

        state.unlockedXpubs[newAccountId] = {} as any;
        for (const type of Object.values(ADDRESS_TYPES)) {
          state.unlockedXpubs[newAccountId][type] = await deriveAccountXpub(state.tempMnemonic, type, 0);
        }
      } else {
        // Adding a new independent seed
        const encryptedBlob = await encrypt(state.tempMnemonic, password);

        state.accounts.push({
          id: newAccountId,
          name,
          addressType: addrType,
          accountIndex: 0,
          encryptedSeed: JSON.stringify(encryptedBlob)
        });

        state.unlockedXpubs[newAccountId] = {} as any;
        for (const type of Object.values(ADDRESS_TYPES)) {
          state.unlockedXpubs[newAccountId][type] = await deriveAccountXpub(state.tempMnemonic, type, 0);
        }
      }

      state.tempMnemonic = '0'.repeat(64);
      delete state.tempMnemonic;

      state.activeAccountId = newAccountId;
      state.currentAddressType = addrType;
      state.currentAddressIndex = 0;
      clearPending();

      await saveWalletConfig({
        activeAccountId: state.activeAccountId,
        accounts: state.accounts
      });

      saveSessionToBackground();
      navigate('dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to encrypt wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ background: 'var(--bg-base)' }}>
      <header className="page-header">
        <button className="page-header__back" onClick={goBack}>←</button>
        <h2 className="page-header__title">{isAddingAccount ? 'Verify Password' : 'Set Password'}</h2>
        <div style={{ width: '34px' }}></div>
      </header>

      <div className="form-page">
        <div className="form-page__header">
          <div className="form-page__icon"><KeyIcon /></div>
          <h2 className="form-page__title">{isAddingAccount ? 'Enter Password' : 'Secure Wallet'}</h2>
          <p className="form-page__subtitle">
            {isAddingAccount
              ? 'Enter your app password to securely encrypt and save this new seed phrase.'
              : 'This password encrypts your seed phrase locally on your device.'}
          </p>
        </div>

        <div className="input-group">
          <label className="input-label">{isAddingAccount ? 'Password' : 'New Password'}</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
        </div>

        {!isAddingAccount && (
          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError('');
              }}
            />
          </div>
        )}

        {error && <div className="input-error-msg">{error}</div>}

        {!isAddingAccount && (
          <label className="checkbox-row" style={{ marginTop: '16px' }}>
            <input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} />
            <span style={{ color: 'var(--text-primary)' }}>Password is not recoverable. I have securely saved my seed phrase.</span>
          </label>
        )}

        <div className="form-footer">
          <button
            className={`btn btn--primary ${loading ? 'btn--loading' : ''}`}
            onClick={handleCreate}
            disabled={!password || (!isAddingAccount && !confirm) || loading || (!isAddingAccount && !backedUp)}
          >
            {isAddingAccount ? 'Verify & Save' : 'Encrypt & Save Wallet'}
          </button>
        </div>

        {isAddingAccount && (
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              className="btn btn--ghost btn--sm"
              style={{ color: 'var(--red)', fontSize: '13px' }}
              onClick={async () => {
                const conf = window.confirm('DANGER: This will delete ALL wallets and data from this device! Are you sure?');
                if (conf) {
                  const { deleteWallet } = await import('../../engine/storage');
                  await deleteWallet();
                  navigate('welcome');
                }
              }}
            >
              Forget Password? (Wipe Data)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
