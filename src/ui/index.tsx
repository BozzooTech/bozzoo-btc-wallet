import '../polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import '../styles/main.css';
import '../styles/dashboard.css';
import '../styles/send.css';
import '../styles/receive.css';

const init = () => {
  const container = document.getElementById('app');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
