import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import TopNav from '../components/TopNav';
import { clearSession, state } from '../state';
import { clearWallet, deriveKeyPair, verifyPasswordHash as verifyPassword } from '../../engine/wallet';
import { DONATION_ADDRESS } from '../../engine/transaction';
import { ShieldIcon, PadlockIcon, TrashIcon, ChevronRightIcon } from '../components/Icons';
import ConfirmModal from '../components/ConfirmModal';

export default function Settings() {
  const { navigate } = useContext(AppContext);
  const [modalType, setModalType] = useState<'delete' | 'backup' | 'private-key' | null>(null);
  const [privateKeyWif, setPrivateKeyWif] = useState<string | null>(null);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Password verify state
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    return () => {
      setRevealedSecret(null);
      setPrivateKeyWif(null);
    };
  }, []);


  const handleLogout = () => {
    clearSession();
    navigate('unlock');
  };

  const executeReset = async () => {
    setIsVerifying(true);
    setModalError('');
    try {
      const isValid = await verifyPassword(modalPassword);
      if (!isValid) {
        throw new Error('Incorrect password');
      }
      await clearWallet();
      const { deleteWallet } = await import('../../engine/storage');
      await deleteWallet();
      clearSession();
      navigate('welcome');
    } catch (err: any) {
      setModalError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleViewBackup = () => {
    setModalType('backup');
    setModalPassword('');
    setModalError('');
    setSecretRevealed(false);
  };

  const handleViewPrivateKey = () => {
    setModalType('private-key');
    setModalPassword('');
    setModalError('');
    setSecretRevealed(false);
    setRevealedSecret(null);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h2 className="page-header__title">Settings</h2>
      </header>

      <div style={{ padding: '24px 16px', flex: 1, overflowY: 'auto' }}>

        <div className="card card--glass" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
          <div className="settings-list">

            <div className="settings-item" onClick={handleViewBackup}>
              <div className="settings-item__icon"><ShieldIcon /></div>
              <div className="settings-item__text">
                <div className="settings-item__label">Backup Seed Phrase</div>
                <div className="settings-item__desc">View your 12-word recovery phrase</div>
              </div>
              <div className="settings-item__arrow"><ChevronRightIcon /></div>
            </div>

            <div className="settings-item" onClick={handleViewPrivateKey}>
              <div className="settings-item__icon"><ShieldIcon /></div>
              <div className="settings-item__text">
                <div className="settings-item__label">View Private Key</div>
                <div className="settings-item__desc">View key for current active address</div>
              </div>
              <div className="settings-item__arrow"><ChevronRightIcon /></div>
            </div>

            <div className="settings-item" onClick={() => navigate('send', { prefilledAddress: DONATION_ADDRESS, donationMode: true })}>
              <div className="settings-item__icon">&#x2764;</div>
              <div className="settings-item__text">
                <div className="settings-item__label">Donate to Developer</div>
                <div className="settings-item__desc">Help add features & improve security</div>
              </div>
              <div className="settings-item__arrow"><ChevronRightIcon /></div>
            </div>

            <div className="settings-item" onClick={handleLogout}>
              <div className="settings-item__icon"><PadlockIcon /></div>
              <div className="settings-item__text">
                <div className="settings-item__label">Lock Wallet</div>
                <div className="settings-item__desc">Require password to open again</div>
              </div>
              <div className="settings-item__arrow"><ChevronRightIcon /></div>
            </div>

          </div>
        </div>

        <h3 className="section-label" style={{ color: 'var(--red)', marginTop: '32px' }}>Danger Zone</h3>
        <div className="card card--glass" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--red)' }}>
          <div className="settings-list">
            <div className="settings-item" onClick={() => { setModalType('delete'); setModalPassword(''); setModalError(''); }}>
              <div className="settings-item__icon" style={{ color: 'var(--red)' }}><TrashIcon /></div>
              <div className="settings-item__text">
                <div className="settings-item__label" style={{ color: 'var(--red)' }}>Delete All Wallets & Data</div>
                <div className="settings-item__desc">Start again from scratch</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '32px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: '1.6' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Bozzoo Wallet v1.0.0</div>
          <div>Open-Source | Non-Custodial</div>
          {/* <a href="https://bozzoo.qzz.io/wallet" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)', textDecoration: 'none', display: 'inline-block', marginTop: '8px' }}>
            View on GitHub
          </a> */}
        </div>

      </div>

      <ConfirmModal
        isOpen={modalType === 'delete'}
        title="Delete All Wallets"
        message="WARNING: This will permanently delete ALL wallets from this device. Ensure you have your seed phrases backed up! This action cannot be undone."
        confirmText={isVerifying ? 'Verifying...' : 'Yes, Delete All Data'}
        danger={true}
        onConfirm={executeReset}
        onCancel={() => setModalType(null)}
      >
        <div style={{ marginTop: '16px' }}>
          <label className="input-label" style={{ color: 'var(--red)' }}>Enter Password to Confirm</label>
          <input
            type="password"
            className="input"
            placeholder="App Password"
            value={modalPassword}
            onChange={(e) => { setModalPassword(e.target.value); setModalError(''); }}
            disabled={isVerifying}
          />
          {modalError && <div style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px' }}>{modalError}</div>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={modalType === 'backup'}
        title="Seed Phrase"
        message={!secretRevealed ? "Enter your password to view your seed phrase." : "Ensure no one is looking at your screen."}
        confirmText={!secretRevealed ? (isVerifying ? 'Verifying...' : 'Reveal Seed Phrase') : 'Done'}
        onConfirm={async () => {
          if (!secretRevealed) {
            setIsVerifying(true);
            setModalError('');
            try {
              const { decrypt } = await import('../../security/encryption');
              const { unlockWallet } = await import('../../engine/wallet');

              const active = state.accounts?.find(a => a.id === state.activeAccountId);
              const rootId = active?.parentId || active?.id;
              const rootAcc = state.accounts?.find(a => a.id === rootId);

              let decryptedSeed = '';
              if (rootAcc?.encryptedSeed) {
                decryptedSeed = await decrypt(JSON.parse(rootAcc.encryptedSeed), modalPassword);
              } else {
                const w = await unlockWallet(modalPassword);
                if (w) decryptedSeed = w;
              }

              if (!decryptedSeed) throw new Error('Incorrect password');

              setRevealedSecret(decryptedSeed);
              setSecretRevealed(true);
            } catch (err: any) {
              setModalError(err.message || 'Verification failed');
            } finally {
              setIsVerifying(false);
            }
          } else {
            setModalType(null);
            setRevealedSecret(null);
          }
        }}
        onCancel={() => { setModalType(null); setRevealedSecret(null); }}
      >
        {!secretRevealed ? (
          <div style={{ marginTop: '16px' }}>
            <input
              type="password"
              className="input"
              placeholder="App Password"
              value={modalPassword}
              onChange={(e) => { setModalPassword(e.target.value); setModalError(''); }}
              disabled={isVerifying}
            />
            {modalError && <div style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px' }}>{modalError}</div>}
          </div>
        ) : (
          <div style={{ background: 'var(--bg-base)', padding: '16px', borderRadius: '8px', border: '2px solid var(--orange)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--orange)' }}>
              <ShieldIcon /> <span style={{ fontWeight: 600 }}>Secret Recovery Phrase</span>
            </div>
            <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)', userSelect: 'all' }}>
              {revealedSecret}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
              Never share this with anyone! Anyone with this phrase can steal your funds.
            </div>
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        isOpen={modalType === 'private-key'}
        title="Private Key (WIF)"
        message={!secretRevealed ? `Enter your password to view the private key for Index ${state.currentAddressIndex}.` : "NEVER share this with anyone!"}
        confirmText={!secretRevealed ? (isVerifying ? 'Verifying...' : 'Reveal Private Key') : 'Done'}
        danger={true}
        onConfirm={async () => {
          if (!secretRevealed) {
            setIsVerifying(true);
            setModalError('');
            try {
              const { decrypt } = await import('../../security/encryption');
              const { unlockWallet } = await import('../../engine/wallet');

              const active = state.accounts?.find(a => a.id === state.activeAccountId);
              const rootId = active?.parentId || active?.id;
              const rootAcc = state.accounts?.find(a => a.id === rootId);

              let decryptedSeed = '';
              if (rootAcc?.encryptedSeed) {
                decryptedSeed = await decrypt(JSON.parse(rootAcc.encryptedSeed), modalPassword);
              } else {
                const w = await unlockWallet(modalPassword);
                if (w) decryptedSeed = w;
              }

              if (!decryptedSeed) throw new Error('Incorrect password');

              const accIndex = active?.accountIndex || 0;
              const kp = await deriveKeyPair(decryptedSeed, state.currentAddressType, state.currentAddressIndex, accIndex);
              setRevealedSecret(kp.toWIF());
              setSecretRevealed(true);

              // Wipe seed from memory
              decryptedSeed = '0'.repeat(128);
            } catch (err: any) {
              setModalError(err.message || 'Verification failed');
            } finally {
              setIsVerifying(false);
            }
          } else {
            setModalType(null);
            setRevealedSecret(null);
          }
        }}
        onCancel={() => { setModalType(null); setRevealedSecret(null); }}
      >
        {!secretRevealed ? (
          <div style={{ marginTop: '16px' }}>
            <input
              type="password"
              className="input"
              placeholder="App Password"
              value={modalPassword}
              onChange={(e) => { setModalPassword(e.target.value); setModalError(''); }}
              disabled={isVerifying}
            />
            {modalError && <div style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px' }}>{modalError}</div>}
          </div>
        ) : (
          <div style={{ background: 'var(--bg-base)', padding: '16px', borderRadius: '8px', border: '2px solid var(--red)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--red)' }}>
              <ShieldIcon /> <span style={{ fontWeight: 600 }}>Private Key</span>
            </div>
            <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-primary)', userSelect: 'all' }}>
              {revealedSecret}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
              Anyone with this key can spend your funds for this specific address.
            </div>
          </div>
        )}
      </ConfirmModal>
      <TopNav />
    </div>
  );
}
