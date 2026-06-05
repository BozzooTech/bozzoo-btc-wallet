import React, { useContext, useState } from 'react';
import { AppContext } from '../App';

const features = [
  { icon: '🔐', title: 'Zero Knowledge', desc: 'Keys encrypted with AES-256-GCM. Your password never stored anywhere.' },
  { icon: '🌐', title: '4 Address Types', desc: 'Legacy (P2PKH), Nested SegWit, Native SegWit & Taproot in one wallet.' },
  { icon: '📤', title: 'Multi-Send', desc: 'Send to 20 recipients in one transaction — save up to 80% on fees.' },
  { icon: '🪙', title: 'Coin Control', desc: 'Manually pick which UTXOs to spend for maximum privacy.' },
  { icon: '⏱️', title: 'Auto-Lock', desc: 'Wallet locks automatically after 10 minutes of inactivity.' },
  { icon: '🔓', title: 'Open Source', desc: 'Every line of code is public and auditable on GitHub.' },
];

const comparisons = [
  {
    feature: 'Open Source',
    bozzoo: true,
    metamask: true,
    exodus: false,
    phantom: false,
  },
  {
    feature: 'Bitcoin-Only (no bloat)',
    bozzoo: true,
    metamask: false,
    exodus: false,
    phantom: false,
  },
  {
    feature: 'Multi-Send (batch tx)',
    bozzoo: true,
    metamask: false,
    exodus: false,
    phantom: false,
  },
  {
    feature: 'Manual Coin Control',
    bozzoo: true,
    metamask: false,
    exodus: false,
    phantom: false,
  },
  {
    feature: 'Taproot Support',
    bozzoo: true,
    metamask: false,
    exodus: true,
    phantom: false,
  },
  {
    feature: 'No Tracking / Analytics',
    bozzoo: true,
    metamask: false,
    exodus: false,
    phantom: false,
  },
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

  const Check = ({ ok }: { ok: boolean }) => (
    <span style={{ color: ok ? 'var(--green, #4caf50)' : 'var(--text-muted)', fontWeight: 700, fontSize: '14px' }}>
      {ok ? '✓' : '✗'}
    </span>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>

      {/* Header — Logo */}
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
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bitcoin — Your keys, your coins</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '0 16px', gap: '4px', flexShrink: 0 }}>
        {([['features', '✨ Features'], ['how', '⚙️ How It Works'], ['compare', '📊 vs Others']] as [Tab, string][]).map(([t, label]) => (
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
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                background: 'var(--bg-surface)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '18px', flexShrink: 0, lineHeight: 1.3 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{f.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{f.desc}</div>
                </div>
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
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', textAlign: 'center' }}>
              vs MetaMask · Exodus · Phantom
            </div>
            <div style={{
              borderRadius: '8px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              fontSize: '11px',
            }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px 52px 52px', background: 'var(--bg-surface)', padding: '8px 10px', fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                <span>Feature</span>
                <span style={{ textAlign: 'center', color: 'var(--orange)' }}>Us</span>
                <span style={{ textAlign: 'center' }}>MM</span>
                <span style={{ textAlign: 'center' }}>Exd</span>
                <span style={{ textAlign: 'center' }}>Pht</span>
              </div>
              {comparisons.map((row, i) => (
                <div key={row.feature} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 52px 52px 52px 52px',
                  padding: '8px 10px',
                  background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)',
                  borderBottom: i < comparisons.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'center',
                }}>
                  <span style={{ color: 'var(--text-secondary)', lineHeight: '1.3' }}>{row.feature}</span>
                  <span style={{ textAlign: 'center' }}><Check ok={row.bozzoo} /></span>
                  <span style={{ textAlign: 'center' }}><Check ok={row.metamask} /></span>
                  <span style={{ textAlign: 'center' }}><Check ok={row.exodus} /></span>
                  <span style={{ textAlign: 'center' }}><Check ok={row.phantom} /></span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
              MM = MetaMask · Exd = Exodus · Pht = Phantom
            </div>
          </div>
        )}
      </div>

      {/* Bottom — fixed */}
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
          I understand this is a self-custody wallet — if I lose my seed phrase, my funds cannot be recovered.
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
