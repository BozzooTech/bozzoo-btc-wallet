import React, { useContext, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AppContext } from '../App';
import TopNav from '../components/TopNav';
import { state } from '../state';
import { deriveAddress } from '../../engine/wallet';
import GlobalHeader from '../components/GlobalHeader';

export default function Receive() {
  const { navigate } = useContext(AppContext);
  const [address, setAddress] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const loadAddress = async () => {
    try {
      const active = state.accounts?.find(a => a.id === state.activeAccountId);
      const accIndex = active?.accountIndex ?? 0;

      const xpub = state.unlockedXpubs[state.activeAccountId!]?.[state.currentAddressType];
      if (!xpub) throw new Error('Wallet locked');

      const addrInfo = await deriveAddress(xpub, state.currentAddressType, state.currentAddressIndex, accIndex);
      setAddress(addrInfo.address);
      const dataUrl = await QRCode.toDataURL(`bitcoin:${addrInfo.address}`, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      });
      setQrCodeDataUrl(dataUrl);
    } catch (err) {
      console.error('Receive address error', err);
    }
  };

  useEffect(() => {
    loadAddress();
  }, []);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page">
      <GlobalHeader onAccountChange={loadAddress} onRefresh={loadAddress} />
        <header className="page-header">
          <h2 className="page-header__title">Receive Bitcoin</h2>
        </header>

      <div style={{ padding: '24px 16px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {qrCodeDataUrl ? (
          <div className="qr-container" style={{ marginBottom: '24px' }}>
            <img src={qrCodeDataUrl} alt="Bitcoin Address QR Code" />
          </div>
        ) : (
          <div className="qr-container" style={{ marginBottom: '24px', width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner"></div>
          </div>
        )}

        <div className="card card--glass" style={{ width: '100%', textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Your Address
          </div>
          <div
            onClick={handleCopy}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              wordBreak: 'break-all',
              cursor: 'pointer',
              padding: '8px',
              background: 'var(--bg-input)',
              borderRadius: '6px',
              border: '1px solid var(--border)'
            }}
          >
            {address || 'Loading...'}
          </div>

          <button
            className="btn btn--ghost"
            onClick={handleCopy}
            style={{ marginTop: '16px', fontSize: '12px' }}
          >
            {copied ? '✓ Copied!' : 'Copy Address'}
          </button>
        </div>

      </div>
      <TopNav />
    </div>
  );
}
