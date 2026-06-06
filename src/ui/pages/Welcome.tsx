import React, { useContext, useState } from 'react';
import { AppContext } from '../App';

const features = [
  { title: 'Non-Custodial', desc: 'You hold the keys. No servers, no accounts, no KYC.' },
  { title: '4 Address Types Supported', desc: 'Legacy (P2PKH), Nested SegWit (P2SH), Native SegWit (P2WPKH), Taproot (P2TR).' },
  { title: 'HD Wallet Architecture', desc: 'Utilizes BIP-39/44/49/84/86 standard derivation paths for infinite address generation.' },
  { title: 'Multi-Send (Transaction Batching)', desc: 'Add multiple recipients visually and send one single transaction.' },
  { title: 'Advanced Coin Control', desc: 'View your UTXOs and manually select which ones to include in your transaction to preserve privacy.' },
  { title: 'Dynamic Fee Estimation', desc: 'Real-time rates from the live mempool, ensuring competitive inclusion times.' },
  { title: 'AES-256-GCM Encryption', desc: 'Your seed phrase is heavily encrypted before it ever touches your local storage.' },
  { title: 'PBKDF2 Password Hashing', desc: '100,000 iterations with a random salt to protect against brute-force attacks.' },
  { title: 'Auto-Lock Security', desc: 'Automatically locks the wallet after 10 minutes of inactivity.' },
  { title: 'Strict Derivation Bounds', desc: 'Safely enforces standard BIP32 maximum derivation limits preventing path overflow and invalid key generation.' },
  { title: 'Voluntary Donation System', desc: 'A completely optional, transparent toggle to support development without hidden fees.' },
];

const comparisons = [
  {
    feature: 'Multi-Send (Batching)',
    bozzoo: 'Send to up to 20 addresses in a single transaction, cutting network fees by up to 60%.',
    bozzooIcon: 'check',
    others: 'Usually restricted to 1 transaction per recipient.',
    othersIcon: 'cross'
  },
  {
    feature: 'Advanced Coin Control',
    bozzoo: 'Full manual UTXO selection for ultimate privacy. You choose exactly which coins to spend.',
    bozzooIcon: 'check',
    others: 'Rarely supported, or hidden behind complex "pro" menus.',
    othersIcon: 'warning'
  },
  {
    feature: 'Real-time Dynamic Fees',
    bozzoo: 'Uses pure live data from a native fallback network without artificially inflating numbers.',
    bozzooIcon: 'check',
    others: 'Frequently use delayed or static node RPC fee estimates and artificially bump ranges.',
    othersIcon: 'warning'
  },
  {
    feature: '100% Free & Transparent',
    bozzoo: 'Zero hidden routing fees. We use a strictly voluntary donation model.',
    bozzooIcon: 'check',
    others: 'Often inject hidden swap fees or flat platform taxes.',
    othersIcon: 'cross'
  },
  {
    feature: 'Complete Address Support',
    bozzoo: 'Seamlessly toggle between Legacy, Nested SegWit, Native SegWit, and Taproot.',
    bozzooIcon: 'check',
    others: 'Usually locked into Native SegWit or Taproot only.',
    othersIcon: 'warning'
  }
];

const steps = [
  { n: '1', title: 'Create or Import', desc: 'Generate a new HD wallet or import your existing seed phrase.' },
  { n: '2', title: 'Set a Password', desc: 'Your seed is encrypted with AES-256-GCM using your password via PBKDF2.' },
  { n: '3', title: 'Send & Receive', desc: 'Manage multiple address types, send to multiple recipients, control your UTXOs.' },
  { n: '4', title: 'Stay Private', desc: 'Private keys derived on-demand, never stored. Auto-lock keeps you safe.' },
];

type Tab = 'features' | 'how' | 'compare';

export default function Welcome() {
  const { navigate } = useContext(AppContext);
  const [agreed, setAgreed] = useState(false);
  const [tab, setTab] = useState<Tab>('features');

  const getIcon = (type: string) => {
    if (type === 'check') return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green, #4caf50)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
    if (type === 'cross') return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red, #f44336)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
    if (type === 'warning') return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #ff9800)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>;
    return null;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>

      {/* Header - Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '20px 20px 12px',
        flexShrink: 0,
      }}>
        <img src="assets/icon.png" alt="Bozzoo" style={{ width: '40px', height: '40px', filter: 'drop-shadow(0 2px 10px rgba(247,148,26,0.5))' }} />
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--text-primary)', lineHeight: 1.1 }}>Bozzoo Wallet</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bitcoin - Your keys, your coins</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '0 16px', gap: '4px', flexShrink: 0 }}>
        {([['features', 'Features'], ['how', 'How It Works'], ['compare', 'vs Others']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '10px',
            fontWeight: tab === t ? 700 : 500,
            background: tab === t ? 'var(--orange)' : 'var(--bg-surface)',
            color: tab === t ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 8px' }}>

        {tab === 'features' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {features.map(f => (
              <div key={f.title} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                padding: '10px 12px',
                background: 'var(--bg-surface)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{f.title}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'how' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {steps.map((s) => (
              <div key={s.n} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '10px 12px',
                background: 'var(--bg-surface)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                position: 'relative',
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--orange)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{s.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{s.desc}</div>
                </div>
              </div>
            ))}
            <div style={{ padding: '10px 12px', background: 'rgba(247,148,26,0.08)', borderRadius: '8px', border: '1px solid rgba(247,148,26,0.2)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5', marginTop: '4px' }}>
              🔒 <strong>Security Model:</strong> All cryptography runs locally in your browser using the Web Crypto API. No server involved. Your seed phrase is encrypted with AES-256-GCM before it touches storage. Keys are derived on-the-fly only when signing and immediately wiped.
            </div>
          </div>
        )}

        {tab === 'compare' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {comparisons.map((row) => (
              <div key={row.feature} style={{
                padding: '10px 12px',
                background: 'var(--bg-surface)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{row.feature}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, marginTop: '2px' }}>{getIcon(row.bozzooIcon)}</span>
                    <span style={{ color: 'var(--text-primary)', lineHeight: '1.4' }}><strong>Us:</strong> {row.bozzoo}</span>
                  </div>
                  <div style={{ fontSize: '11px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, marginTop: '2px' }}>{getIcon(row.othersIcon)}</span>
                    <span style={{ color: 'var(--text-muted)', lineHeight: '1.4' }}><strong>Others:</strong> {row.others}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom - fixed */}
      <div style={{ padding: '8px 16px 20px', flexShrink: 0, borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          marginBottom: '12px',
          lineHeight: '1.5',
          paddingTop: '8px',
        }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: '2px', accentColor: 'var(--orange)', flexShrink: 0 }}
          />
          <span>I understand this is a self-custody wallet - if I lose my seed phrase, my funds cannot be recovered. <strong>We are not responsible for any data loss. We are unable to recover your wallets. Please secure your wallet seed phrases.</strong></span>
        </label>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn--primary"
            disabled={!agreed}
            onClick={() => navigate('create')}
            style={{ flex: 1 }}
          >
            Create Wallet
          </button>
          <button
            className="btn btn--secondary"
            disabled={!agreed}
            onClick={() => navigate('import')}
            style={{ flex: 1 }}
          >
            Import Seed
          </button>
        </div>
      </div>
    </div>
  );
}
