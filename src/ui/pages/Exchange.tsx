import { useContext } from 'react';
import { AppContext } from '../App';
import TopNav from '../components/TopNav';
import GlobalHeader from '../components/GlobalHeader';

export default function Exchange() {
  const { navigate } = useContext(AppContext);

  const exchanges = [
    {
      id: 'trocador',
      name: 'Trocador',
      description: 'Privacy-focused aggregator. Best rates, no KYC, no logs.',
      icon: 'https://trocador.app/static/img/favicon.png',
      url: 'https://trocador.app/?ref=KnPiqABkjp'
    },
    {
      id: 'exolix',
      name: 'Exolix',
      description: 'Fast, secure and anonymous crypto exchange with fixed and floating rates.',
      icon: 'https://exolix.com/favicon.ico',
      url: 'https://exolix.com?ref=7EACF7A04ACF688153303EEFC25872CF'
    }
  ];

  const handleOpen = (url: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <GlobalHeader onAccountChange={() => { }} onRefresh={() => { }} />
      <header className="page-header">
        <h2 className="page-header__title">Swap Coins</h2>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', overflowY: 'auto', alignItems: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', textAlign: 'center', maxWidth: '500px', lineHeight: 1.5 }}>
          Swap coins securely with trusted privacy-focused exchange partners.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', width: '100%', maxWidth: '700px' }}>
          {exchanges.map((exchange) => (
            <div
              key={exchange.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-surface)',
                padding: '20px',
                borderRadius: '12px',
                boxShadow: 'var(--shadow-sm)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, transform 0.2s ease',
              }}
              onClick={() => handleOpen(exchange.url)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface-2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '16px' }}>
                <img src={exchange.icon} alt={`${exchange.name} icon`} style={{ width: '32px', height: '32px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{exchange.name}</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{exchange.description}</p>
              </div>
              <div style={{ paddingLeft: '16px' }}>
                <svg width="20" height="20" fill="none" stroke="var(--text-secondary)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TopNav />
    </div>
  );
}
