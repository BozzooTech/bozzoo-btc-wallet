import React, { useContext } from 'react';
import { AppContext } from '../App';

export default function TopNav() {
  const { route, navigate } = useContext(AppContext);

  return (
    <nav className="footer-nav">
      <button
        className={`footer-nav__item ${route === 'dashboard' ? 'footer-nav__item--active' : ''}`}
        onClick={() => navigate('dashboard')}
      >
        <span className="footer-nav__icon">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        </span>
        <span className="footer-nav__label">Home</span>
      </button>

      <button
        className={`footer-nav__item ${route === 'send' ? 'footer-nav__item--active' : ''}`}
        onClick={() => navigate('send')}
      >
        <span className="footer-nav__icon">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
        </span>
        <span className="footer-nav__label">Send</span>
      </button>

      <button
        className={`footer-nav__item ${route === 'receive' ? 'footer-nav__item--active' : ''}`}
        onClick={() => navigate('receive')}
      >
        <span className="footer-nav__icon">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
        </span>
        <span className="footer-nav__label">Receive</span>
      </button>

      <button
        className={`footer-nav__item ${route === 'wallets' ? 'footer-nav__item--active' : ''}`}
        onClick={() => navigate('wallets')}
      >
        <span className="footer-nav__icon">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
        </span>
        <span className="footer-nav__label">Wallets</span>
      </button>

      <button
        className={`footer-nav__item ${route === 'settings' ? 'footer-nav__item--active' : ''}`}
        onClick={() => navigate('settings')}
      >
        <span className="footer-nav__icon">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </span>
        <span className="footer-nav__label">Settings</span>
      </button>
    </nav>
  );
}
