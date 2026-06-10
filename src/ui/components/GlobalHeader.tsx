import React, { useContext, useState, useRef, useEffect } from 'react';
import { AppContext } from '../App';
import { state } from '../state';
import { getWalletConfig, saveWalletConfig } from '../../engine/storage';
import { deriveAddress } from '../../engine/wallet';
import { MaximizeIcon, ChevronDownIcon, PlusIcon, MinusIcon } from './Icons';
import ConfirmModal from './ConfirmModal';

interface GlobalHeaderProps {
  onAccountChange: () => void;
  onRefresh: () => void;
}

export default function GlobalHeader({ onAccountChange, onRefresh }: GlobalHeaderProps) {
  const { navigate } = useContext(AppContext);

  // Dropdown state
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showSubAccountDropdown, setShowSubAccountDropdown] = useState(false);
  const subDropdownRef = useRef<HTMLDivElement>(null);

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const [forceRender, setForceRender] = useState(0);

  // Password Prompt State
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [accountsToCreate, setAccountsToCreate] = useState(1);
  const [activeAddress, setActiveAddress] = useState('');

  useEffect(() => {
    const loadAddress = async () => {
      try {
        const active = state.accounts?.find(a => a.id === state.activeAccountId);
        const accIndex = active?.accountIndex ?? 0;
        const xpub = state.unlockedXpubs[state.activeAccountId!]?.[state.currentAddressType];
        if (!xpub) {
          setActiveAddress('');
          return;
        }
        const addrInfo = await deriveAddress(xpub, state.currentAddressType, state.currentAddressIndex, accIndex);
        setActiveAddress(addrInfo.address);
      } catch (err) {
        console.error('Failed to load active address', err);
      }
    };
    loadAddress();
  }, [state.activeAccountId, state.currentAddressType, state.currentAddressIndex, forceRender]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAccountDropdown(false);
        setIsRenaming(false);
      }
      if (subDropdownRef.current && !subDropdownRef.current.contains(event.target as Node)) {
        setShowSubAccountDropdown(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeAccount = state.accounts?.find(a => a.id === state.activeAccountId);

  const selectAccount = async (id: string, isExplicitSubAccount = false) => {
    const config = await getWalletConfig();
    const targetAccount = state.accounts.find(a => a.id === id);
    let idToSelect = id;

    if (targetAccount && !targetAccount.parentId) {
      if (!isExplicitSubAccount && targetAccount.lastActiveSubAccountId) {
        const subExists = state.accounts.find(a => a.id === targetAccount.lastActiveSubAccountId);
        if (subExists) idToSelect = targetAccount.lastActiveSubAccountId;
      }
      if (isExplicitSubAccount) {
        targetAccount.lastActiveSubAccountId = id;
        const rootConfig = config.accounts.find(a => a.id === id);
        if (rootConfig) rootConfig.lastActiveSubAccountId = id;
      }
    } else if (targetAccount && targetAccount.parentId) {
      const root = state.accounts.find(a => a.id === targetAccount.parentId);
      if (root) root.lastActiveSubAccountId = id;
      const rootConfig = config.accounts.find(a => a.id === targetAccount.parentId);
      if (rootConfig) rootConfig.lastActiveSubAccountId = id;
    }

    config.activeAccountId = idToSelect;
    await saveWalletConfig(config);
    state.activeAccountId = idToSelect;

    const account = state.accounts.find(a => a.id === idToSelect);
    if (account) {
      state.currentAddressType = account.addressType || 'native_segwit';
      state.currentAddressIndex = account.lastAddressIndex || 0;
    }
    setShowAccountDropdown(false);
    onAccountChange();
    setForceRender(prev => prev + 1);
  };

  const handleSelectSubAccount = (id: string) => {
    selectAccount(id, true);
    setShowSubAccountDropdown(false);
  };

  const handleRename = async () => {
    if (newName.trim() && activeAccount) {
      const config = await getWalletConfig();
      const updatedAccounts = config.accounts.map(a => a.id === activeAccount.id ? { ...a, name: newName.trim() } : a);
      config.accounts = updatedAccounts;
      await saveWalletConfig(config);
      state.accounts = updatedAccounts;
      setIsRenaming(false);
      setForceRender(prev => prev + 1);
    }
  };

  const handleAddAccountClick = () => {
    setShowSubAccountDropdown(false);
    setShowPasswordPrompt(true);
    setModalPassword('');
    setModalError('');
    setAccountsToCreate(1);
  };

  const executeAddAccount = async () => {
    setIsVerifying(true);
    setModalError('');
    try {
      const { decrypt } = await import('../../security/encryption');
      const { unlockWallet, verifyPasswordHash, deriveAccountXpub } = await import('../../engine/wallet');

      const isValid = await verifyPasswordHash(modalPassword);
      if (!isValid) throw new Error('Incorrect password');

      const rootId = activeAccount?.parentId || activeAccount?.id;
      if (!rootId) throw new Error('No active account');

      const rootWallet = state.accounts.find(a => a.id === rootId);
      if (!rootWallet) throw new Error('Root wallet not found');

      let decryptedSeed = '';
      if (rootWallet.encryptedSeed) {
        decryptedSeed = await decrypt(JSON.parse(rootWallet.encryptedSeed), modalPassword);
      } else {
        const w = await unlockWallet(modalPassword);
        if (w) decryptedSeed = w;
      }

      if (!decryptedSeed) throw new Error('Failed to decrypt wallet');

      // All accounts belonging to this root (root + sub-accounts)
      const groupAccounts = state.accounts.filter(
        a => a.id === rootId || a.parentId === rootId
      );

      // Find the highest existing account index so we always continue from it
      const highestExistingIndex = Math.max(...groupAccounts.map(a => a.accountIndex ?? 0));

      const count = Math.max(1, Math.min(20, accountsToCreate));
      const newAccounts: typeof state.accounts = [];
      const newXpubsMap: Record<string, Record<string, string>> = {};
      const TYPES = ['native_segwit', 'taproot', 'nested_segwit', 'legacy'] as const;

      for (let i = 0; i < count; i++) {
        const newAccIndex = highestExistingIndex + 1 + i;
        const newId = crypto.randomUUID();

        // Derive xpubs for new account BEFORE wiping seed
        const newXpubs: Record<string, string> = {};
        for (const type of TYPES) {
          newXpubs[type] = await deriveAccountXpub(decryptedSeed, type as any, newAccIndex);
        }

        newAccounts.push({
          id: newId,
          name: `Account ${newAccIndex + 1}`,
          addressType: rootWallet.addressType || 'native_segwit',
          accountIndex: newAccIndex,
          parentId: rootId,
        });
        newXpubsMap[newId] = newXpubs;
      }

      // Wipe seed immediately after all derivations
      decryptedSeed = '0'.repeat(128);

      // Apply to state
      state.accounts = [...state.accounts, ...newAccounts];

      // Persist
      const config = await getWalletConfig();
      config.accounts = [...config.accounts, ...newAccounts];

      // Switch to the last newly created account
      const lastNewAcc = newAccounts[newAccounts.length - 1];
      config.activeAccountId = lastNewAcc.id;
      await saveWalletConfig(config);

      state.activeAccountId = lastNewAcc.id;
      state.currentAddressIndex = 0;

      // Sync all new xpubs into state
      if (!state.unlockedXpubs) state.unlockedXpubs = {};
      for (const [id, xpubs] of Object.entries(newXpubsMap)) {
        state.unlockedXpubs[id] = xpubs;
      }

      // Save updated session
      const { saveSessionToBackground } = await import('../state');
      await saveSessionToBackground();

      setShowPasswordPrompt(false);
      setModalPassword('');
      onAccountChange();
      setForceRender(prev => prev + 1);

    } catch (err: any) {
      setModalError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const MAX_BIP32_INDEX = 2147483647;

  const setAddressIndex = async (idx: number) => {
    const clampedIdx = Math.max(0, Math.min(idx, MAX_BIP32_INDEX));
    state.currentAddressIndex = clampedIdx;

    // Auto-save the last used index for this account
    const config = await getWalletConfig();
    const active = config.accounts.find(a => a.id === state.activeAccountId);
    if (active && active.lastAddressIndex !== clampedIdx) {
      active.lastAddressIndex = clampedIdx;
      await saveWalletConfig(config);
    }

    // Update active memory state too so it syncs
    const memoryActive = state.accounts.find(a => a.id === state.activeAccountId);
    if (memoryActive) {
      memoryActive.lastAddressIndex = clampedIdx;
    }

    onAccountChange();
    setForceRender(prev => prev + 1);
  };

  const setAddressType = async (type: any) => {
    state.currentAddressType = type;
    const config = await getWalletConfig();
    const active = config.accounts.find(a => a.id === state.activeAccountId);
    if (active) {
      active.addressType = type;
      await saveWalletConfig(config);
    }
    onAccountChange();
    setForceRender(prev => prev + 1);
  };

  return (
    <header className="global-header" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
      {/* Row 1 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap', paddingRight: '8px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="assets/icon.png" alt="Bozzoo-Logo" style={{ width: '100%', filter: 'drop-shadow(0 0px 1px rgba(247, 148, 26, 0.68))' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '4px', flex: 1, minWidth: '150px', alignItems: 'center' }}>
            {/* <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                {(() => {
                  const active = state.accounts?.find(a => a.id === state.activeAccountId);
                  const root = state.accounts?.find(a => a.id === (active?.parentId || active?.id));
                  return root?.name || 'Wallet';
                })()}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                Acc {activeAccount ? (activeAccount.accountIndex ?? 0) + 1 : 1}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                Idx {state.currentAddressIndex}
              </span>
            </div> */}
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--orange)', fontWeight: 700, wordBreak: 'break-all', marginTop: '6px', lineHeight: 1.4, textAlign: 'center' }}>
              {activeAddress || 'Loading...'}
            </span>
          </div>
        </div>

        {/* Refresh & Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', borderRadius: '50%', color: 'var(--text-secondary)' }}
            onClick={onRefresh}
            title="Refresh Balance"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', borderRadius: '50%', color: 'var(--text-secondary)' }}
            onClick={() => window.open(window.location.href, '_blank')}
            title="Open Full Screen"
          >
            <MaximizeIcon />
          </button>
        </div>
      </div>

      {/* Row 2 (Segmented Bar) */}
      <div style={{ display: 'flex', alignItems: 'stretch', width: '100%', background: 'var(--bg-surface-2)', borderRadius: '8px', border: '1px solid var(--border)' }}>

        {/* Wallets Dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative', flex: 1, minWidth: 0, borderRight: '1px solid var(--border)', borderRadius: '8px 0 0 8px' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', padding: '6px 4px', height: '100%', overflow: 'hidden' }}
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
          >
            <span style={{ display: 'block', flex: 1, minWidth: 0, fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
              {(() => {
                if (!activeAccount) return 'Wallet';
                const rootId = activeAccount.parentId || activeAccount.id;
                const rootWallet = state.accounts?.find(a => a.id === rootId);
                return rootWallet?.name || 'Wallet';
              })()}
            </span>
            <ChevronDownIcon style={{ color: 'var(--text-muted)' }} />
          </div>

          {showAccountDropdown && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: '8px',
              background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
              borderRadius: '8px', minWidth: '200px', zIndex: 100, boxShadow: 'var(--shadow-lg)',
              maxHeight: '300px', overflowY: 'auto'
            }}>
              <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', padding: '0 4px' }}>Wallets</div>
                {state.accounts?.filter(a => !a.parentId).map(wallet => {
                  const rootId = activeAccount?.parentId || activeAccount?.id;
                  const isActiveWallet = wallet.id === rootId;
                  return (
                    <div
                      key={wallet.id}
                      onClick={() => selectAccount(wallet.id)}
                      style={{
                        padding: '6px 8px', borderRadius: '4px', fontSize: '13px', cursor: 'pointer',
                        background: isActiveWallet ? 'rgba(255,255,255,0.05)' : 'transparent',
                        color: isActiveWallet ? 'var(--orange)' : 'var(--text-primary)',
                        marginBottom: '4px'
                      }}
                    >
                      {wallet.name}
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                {!isRenaming ? (
                  <div
                    style={{ fontSize: '12px', padding: '6px 8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRenaming(true);
                      const rootId = activeAccount?.parentId || activeAccount?.id;
                      const rootWallet = state.accounts?.find(a => a.id === rootId);
                      setNewName(rootWallet?.name || '');
                    }}
                  >
                    Rename Wallet
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      className="input"
                      style={{ padding: '4px 8px', fontSize: '12px', minHeight: 'auto' }}
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm" style={{ padding: '4px 8px' }} onClick={handleRename}>Save</button>
                  </div>
                )}
              </div>

              <div style={{ padding: '8px' }}>
                <div style={{ fontSize: '12px', padding: '6px 8px', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate('create')}>
                  Create New Wallet
                </div>
                <div style={{ fontSize: '12px', padding: '6px 8px', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate('import')}>
                  Import Wallet
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Accounts Dropdown */}
        <div ref={subDropdownRef} style={{ position: 'relative', flex: 1, minWidth: 0, borderRight: '1px solid var(--border)' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', padding: '6px 4px', height: '100%', overflow: 'hidden' }}
            onClick={() => setShowSubAccountDropdown(!showSubAccountDropdown)}
          >
            <span style={{ display: 'block', flex: 1, minWidth: 0, fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
              {(() => {
                const acc = state.accounts?.find(a => a.id === state.activeAccountId);
                return acc ? `Account ${(acc.accountIndex ?? 0) + 1}` : 'Account';
              })()}
            </span>
            <ChevronDownIcon style={{ color: 'var(--text-muted)' }} />
          </div>

          {showSubAccountDropdown && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px',
              background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
              borderRadius: '8px', minWidth: '150px', zIndex: 100, boxShadow: 'var(--shadow-lg)',
              maxHeight: '300px', overflowY: 'auto'
            }}>
              <div style={{ padding: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', padding: '0 4px' }}>Accounts</div>

                {(() => {
                  const rootId = activeAccount?.parentId || activeAccount?.id;
                  const subAccounts = state.accounts?.filter(a => a.id === rootId || a.parentId === rootId) || [];
                  return subAccounts.map(acc => {
                    const isActive = state.activeAccountId === acc.id;
                    return (
                      <div
                        key={acc.id}
                        onClick={() => handleSelectSubAccount(acc.id)}
                        style={{
                          padding: '6px 8px', borderRadius: '4px', fontSize: '13px', cursor: 'pointer',
                          background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                          color: isActive ? 'var(--orange)' : 'var(--text-primary)',
                          marginBottom: '4px'
                        }}
                      >
                        {`Account ${(acc.accountIndex ?? 0) + 1}`}
                      </div>
                    );
                  });
                })()}

                <div
                  style={{ fontSize: '12px', padding: '6px 8px', color: 'var(--text-primary)', cursor: 'pointer', borderTop: '1px solid var(--border-subtle)', marginTop: '4px' }}
                  onClick={handleAddAccountClick}
                >
                  + Add Account
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Index Jumper */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', flex: 1, minWidth: 0, borderRight: '1px solid var(--border)' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '0 4px', fontSize: '14px', minHeight: '26px' }}
            onClick={() => setAddressIndex(Math.max(0, state.currentAddressIndex - 1))}
            disabled={state.currentAddressIndex === 0}
            title="Previous Address"
          >
            <MinusIcon />
          </button>
          <input
            id='index'
            type="number"
            min="0"
            max={MAX_BIP32_INDEX}
            value={state.currentAddressIndex}
            onChange={(e) => {
              if (e.target.value === '') {
                setAddressIndex(0);
              } else {
                let val = parseInt(e.target.value, 10) || 0;
                if (val > MAX_BIP32_INDEX) val = MAX_BIP32_INDEX;
                setAddressIndex(val);
                e.target.value = val.toString();
              }
            }}
            className="input input-mono"
            style={{
              padding: '0 2px', fontSize: '12px', width: '40px', textAlign: 'center',
              minHeight: '26px', background: 'transparent', border: 'none'
            }}
            title="Address Number"
          />
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '0 4px', fontSize: '14px', minHeight: '26px' }}
            onClick={() => setAddressIndex(state.currentAddressIndex + 1)}
            disabled={state.currentAddressIndex >= MAX_BIP32_INDEX}
            title="Next Address"
          >
            <PlusIcon />
          </button>
        </div>

        {/* Address Type Dropdown */}
        <div ref={typeDropdownRef} style={{ position: 'relative', flex: 1, minWidth: 0, borderRadius: '0 8px 8px 0' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', padding: '6px 4px', height: '100%', overflow: 'hidden' }}
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
          >
            <span style={{ display: 'block', flex: 1, minWidth: 0, fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
              {(() => {
                const types: Record<string, string> = {
                  native_segwit: 'Native SegWit',
                  taproot: 'Taproot',
                  nested_segwit: 'Nested SegWit',
                  legacy: 'Legacy'
                };
                return types[state.currentAddressType] || 'Type';
              })()}
            </span>
            <ChevronDownIcon style={{ color: 'var(--text-muted)' }} />
          </div>

          {showTypeDropdown && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '8px',
              background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
              borderRadius: '8px', minWidth: '140px', zIndex: 100, boxShadow: 'var(--shadow-lg)'
            }}>
              <div style={{ padding: '8px' }}>
                {[
                  { id: 'native_segwit', label: 'Native SegWit' },
                  { id: 'taproot', label: 'Taproot' },
                  { id: 'nested_segwit', label: 'Nested SegWit' },
                  { id: 'legacy', label: 'Legacy' }
                ].map(type => {
                  const isActive = state.currentAddressType === type.id;
                  return (
                    <div
                      key={type.id}
                      onClick={() => { setAddressType(type.id); setShowTypeDropdown(false); }}
                      style={{
                        padding: '6px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                        background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                        color: isActive ? 'var(--orange)' : 'var(--text-primary)',
                        marginBottom: '4px'
                      }}
                    >
                      {type.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showPasswordPrompt}
        title="Add Accounts"
        message="Enter your password to derive keys for new account(s)."
        confirmText={isVerifying ? 'Creating...' : `Create ${accountsToCreate} Account${accountsToCreate > 1 ? 's' : ''}`}
        onConfirm={executeAddAccount}
        onCancel={() => { setShowPasswordPrompt(false); setModalPassword(''); }}
      >
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Number of accounts to create</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                className="input"
                min={1}
                max={20}
                value={accountsToCreate}
                onChange={e => setAccountsToCreate(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                disabled={isVerifying}
                style={{ width: '80px' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {(() => {
                  const rootId = activeAccount?.parentId || activeAccount?.id;
                  const groupAccounts = state.accounts.filter(a => a.id === rootId || a.parentId === rootId);
                  const highest = Math.max(...groupAccounts.map(a => a.accountIndex ?? 0));
                  const startIdx = highest + 1;
                  const endIdx = startIdx + accountsToCreate - 1;
                  return `Will create Account${accountsToCreate > 1 ? 's' : ''} ${startIdx + 1}${accountsToCreate > 1 ? `–${endIdx + 1}` : ''}`;
                })()}
              </span>
            </div>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Password</label>
            <input
              type="password"
              className="input"
              placeholder="App Password"
              value={modalPassword}
              onChange={(e) => { setModalPassword(e.target.value); setModalError(''); }}
              disabled={isVerifying}
            />
          </div>
          {modalError && <div style={{ color: 'var(--red)', fontSize: '12px' }}>{modalError}</div>}
        </div>
      </ConfirmModal>

    </header>
  );
}
