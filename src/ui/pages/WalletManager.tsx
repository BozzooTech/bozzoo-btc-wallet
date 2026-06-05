import React, { useContext, useState } from 'react';
import { AppContext } from '../App';
import TopNav from '../components/TopNav';
import { state } from '../state';
import { saveWalletConfig } from '../../engine/storage';
import { showConfirm } from '../components/GlobalConfirm';
import { XIcon } from '../components/Icons';

export default function WalletManager() {
  const { navigate } = useContext(AppContext);
  const [expandedWallets, setExpandedWallets] = useState<Record<string, boolean>>({});
  const [forceRender, setForceRender] = useState(0);

  const toggleExpand = (id: string) => {
    setExpandedWallets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const switchAccount = async (id: string) => {
    const acc = state.accounts?.find(a => a.id === id);
    if (!acc) return;
    state.activeAccountId = id;
    state.currentAddressType = acc.addressType;
    state.currentAddressIndex = acc.lastAddressIndex || 0;
    await saveWalletConfig({
      activeAccountId: id,
      accounts: state.accounts!
    });
    navigate('dashboard');
  };

  return (
    <div className="page">
      <header className="page-header">
        <h2 className="page-header__title">Wallet Manager</h2>
      </header>

      <div style={{ padding: '24px 16px', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => navigate('create')}>
            + Create New Wallet
          </button>
          <button className="btn btn--secondary" style={{ flex: 1 }} onClick={() => navigate('import')}>
            ↓ Import Wallet
          </button>
        </div>

        <div className="settings-list" style={{ gap: '16px' }}>
          {(() => {
            const rootWallets = state.accounts?.filter(a => !a.parentId) || [];

            return rootWallets.map(wallet => {
              const subAccounts = state.accounts?.filter(a => a.parentId === wallet.id) || [];
              const groupAccounts = [wallet, ...subAccounts];
              const isExpanded = expandedWallets[wallet.id] ?? false;

              const isAnyActiveInGroup = groupAccounts.some(a => a.id === state.activeAccountId);

              return (
                <div key={wallet.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Wallet Folder Card */}
                  <div
                    className="card card--glass"
                    style={{
                      border: '1px solid var(--border)',
                      padding: '16px',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer'
                    }}
                    onClick={() => toggleExpand(wallet.id)}
                  >
                    {isAnyActiveInGroup && (
                      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '2px', background: 'var(--orange)' }} />
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: 'rgba(255,153,0,0.1)', color: 'var(--orange)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', fontWeight: 'bold'
                        }}>
                          {isExpanded ? '▼' : '▶'}
                        </div>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{wallet.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {groupAccounts.length} account(s)
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ color: 'var(--red)', padding: '6px', minWidth: 'auto' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            showConfirm({
                              title: `Delete ${wallet.name}?`,
                              message: `DANGER: Are you sure you want to delete ${wallet.name} AND all its accounts? This cannot be undone!`,
                              danger: true,
                              confirmText: 'Delete All',
                              onConfirm: async () => {
                                // Clean up xpubs for deleted wallet + its sub-accounts
                                const idsToDelete = [wallet.id, ...subAccounts.map(a => a.id)];
                                idsToDelete.forEach(id => { delete state.unlockedXpubs[id]; });

                                state.accounts = state.accounts?.filter(a => a.id !== wallet.id && a.parentId !== wallet.id);
                                if (state.accounts && state.accounts.length === 0) {
                                  const { deleteWallet } = await import('../../engine/storage');
                                  await deleteWallet();
                                  navigate('welcome');
                                  return;
                                }
                                if (isAnyActiveInGroup && state.accounts && state.accounts.length > 0) {
                                  state.activeAccountId = state.accounts[0].id;
                                }
                                await saveWalletConfig({
                                  activeAccountId: state.activeAccountId,
                                  accounts: state.accounts || []
                                });
                                setForceRender(prev => prev + 1);
                              }
                            });
                          }}
                          title="Delete Wallet"
                        >
                          <XIcon style={{ width: '14px', height: '14px' }} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Accounts List */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '16px', paddingLeft: '6px', borderLeft: '2px solid var(--border-subtle)' }}>
                      {groupAccounts.map((acc) => {
                        const isSubActive = state.activeAccountId === acc.id;
                        const isRootAccount = acc.id === wallet.id;

                        return (
                          <div
                            key={acc.id}
                            className="card card--glass"
                            style={{
                              padding: '12px 16px',
                              background: isSubActive ? 'var(--bg-surface-2)' : 'transparent',
                              border: isSubActive ? '1px solid rgba(255, 153, 0, 0.3)' : '1px solid transparent',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => switchAccount(acc.id)}>
                              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                {isRootAccount ? 'Account 1' : acc.name}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Account Index: {acc.accountIndex || 0} &middot; {acc.addressType.replace('_', ' ').toUpperCase()}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                className={`btn btn--sm ${isSubActive ? 'btn--primary' : 'btn--ghost'}`}
                                style={{ padding: '4px 10px', fontSize: '11px' }}
                                onClick={() => switchAccount(acc.id)}
                              >
                                {isSubActive ? 'Active' : 'Select'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>
      <TopNav />
    </div>
  );
}
