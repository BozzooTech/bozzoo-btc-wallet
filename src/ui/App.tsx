import React, { useState, useEffect } from 'react';
import { walletExists, getWalletConfig, getLastActive, deleteWallet } from '../engine/storage';
import { state, clearSession, loadSessionFromBackground, signalActivity } from './state';

import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import Send from './pages/Send';
import Receive from './pages/Receive';
import Settings from './pages/Settings';
import WalletManager from './pages/WalletManager';
import Create from './pages/Create';
import Import from './pages/Import';
import SetPassword from './pages/SetPassword';
import Unlock from './pages/Unlock';
import GlobalAlert from './components/GlobalAlert';
import GlobalConfirm from './components/GlobalConfirm';

export type RouteParams = any;

export const AppContext = React.createContext<{
  route: string;
  navigate: (path: string, params?: RouteParams) => void;
  goBack: () => void;
  routeParams?: RouteParams;
}>({
  route: 'loading',
  navigate: () => {},
  goBack: () => {},
});

export default function App() {
  const [route, setRoute] = useState<string>('loading');
  const [routeParams, setRouteParams] = useState<RouteParams>();
  const [history, setHistory] = useState<string[]>([]);

  const navigate = (path: string, params?: RouteParams) => {
    setHistory(prev => {
      if (path === 'dashboard' || path === 'welcome' || path === 'unlock') {
        return [];
      }
      return [...prev, route];
    });
    setRoute(path);
    setRouteParams(params);
    localStorage.setItem('currentRoute', path);
    if (params) {
      localStorage.setItem('currentRouteParams', JSON.stringify(params));
    } else {
      localStorage.removeItem('currentRouteParams');
    }
  };

  const goBack = () => {
    setHistory(prev => {
      const newHistory = [...prev];
      const previousRoute = newHistory.pop();
      if (previousRoute) {
        setRoute(previousRoute);
        localStorage.setItem('currentRoute', previousRoute);
      } else {
        setRoute('dashboard');
        localStorage.setItem('currentRoute', 'dashboard');
      }
      localStorage.removeItem('currentRouteParams');
      return newHistory;
    });
    setRouteParams(undefined);
  };

  useEffect(() => {
    async function bootstrap() {
      try {
        const config = await getWalletConfig();
        const exists = config.accounts && config.accounts.length > 0;
        if (!exists) {
          navigate('welcome');
          return;
        }

        const lastActive = await getLastActive();
        const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
        if (lastActive && Date.now() - lastActive > SIXTY_DAYS_MS) {
          await deleteWallet();
          navigate('welcome');
          return;
        }

        const sessionActive = await loadSessionFromBackground();
        if (sessionActive || Object.keys(state.unlockedXpubs).length > 0) {
          state.accounts = config.accounts;
          state.activeAccountId = config.activeAccountId;
          const active = state.accounts.find(a => a.id === state.activeAccountId) || state.accounts[0];
          if (active) {
            state.currentAddressType = active.addressType;
            state.currentAddressIndex = active.lastAddressIndex || 0;
          }
          const savedRoute = localStorage.getItem('currentRoute') || 'dashboard';
          let savedParams;
          try {
            const p = localStorage.getItem('currentRouteParams');
            if (p) savedParams = JSON.parse(p);
          } catch(e) {}
          
          if (['dashboard', 'send', 'receive', 'settings', 'wallets'].includes(savedRoute)) {
            // Bypass our own navigate wrapper to avoid wiping history wrongly on initial load
            setRoute(savedRoute);
            setRouteParams(savedParams);
            localStorage.setItem('currentRoute', savedRoute);
          } else {
            navigate('dashboard');
          }
        } else {
          navigate('unlock');
        }
      } catch (err) {
        console.error('Bootstrap error', err);
        navigate('welcome');
      }
    }
    bootstrap();

    const lockListener = (msg: any) => {
      if (msg.type === 'AUTO_LOCK') {
        clearSession();
        navigate('unlock');
      }
    };
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    if (isExtension && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(lockListener);
    }

    // Local inactivity timer (15 minutes)
    let timeout: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (Object.keys(state.unlockedXpubs).length > 0) {
          clearSession();
          navigate('unlock');
        }
      }, 10 * 60 * 1000); // 10 minutes
      signalActivity();
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      if (isExtension && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.removeListener(lockListener);
      }
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  if (route === 'loading') {
    return <div className="page-loading"><div className="spinner"></div></div>;
  }

  const contextValue = { route, navigate, goBack, routeParams };

  return (
    <AppContext.Provider value={contextValue}>
      {route === 'welcome' && <Welcome />}
      {route === 'dashboard' && <Dashboard />}
      {route === 'send' && <Send />}
      {route === 'receive' && <Receive />}
      {route === 'settings' && <Settings />}
      {route === 'wallets' && <WalletManager />}
      {route === 'create' && <Create />}
      {route === 'import' && <Import />}
      {route === 'set-password' && <SetPassword />}
      {route === 'unlock' && <Unlock />}
      <GlobalAlert />
      <GlobalConfirm />
    </AppContext.Provider>
  );
}
