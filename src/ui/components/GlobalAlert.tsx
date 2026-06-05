import React, { useState, useEffect } from 'react';

let globalShowAlert: ((msg: string, type: 'success' | 'error' | 'info') => void) | null = null;

export const showAlert = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
  if (globalShowAlert) globalShowAlert(msg, type);
};

export default function GlobalAlert() {
  const [alert, setAlert] = useState<{ msg: string, type: string } | null>(null);

  useEffect(() => {
    globalShowAlert = (msg, type) => {
      setAlert({ msg, type });
      setTimeout(() => setAlert(null), 3000);
    };
    return () => {
      globalShowAlert = null;
    };
  }, []);

  if (!alert) return null;

  const bg = alert.type === 'error' ? 'var(--red)' : alert.type === 'success' ? 'var(--green)' : 'var(--orange)';

  return (
    <div style={{
      position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
      background: bg, color: '#fff', padding: '12px 24px', borderRadius: '8px',
      boxShadow: 'var(--shadow-lg)', zIndex: 9999, fontWeight: 600,
      fontSize: '13px', pointerEvents: 'none', textAlign: 'center', minWidth: '200px',
      border: '1px solid rgba(255,255,255,0.2)'
    }}>
      {alert.msg}
    </div>
  );
}
