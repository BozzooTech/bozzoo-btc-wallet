import React, { useState, useEffect } from 'react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

let globalShowConfirm: ((options: ConfirmOptions) => void) | null = null;

export const showConfirm = (options: ConfirmOptions) => {
  if (globalShowConfirm) globalShowConfirm(options);
};

export default function GlobalConfirm() {
  const [config, setConfig] = useState<ConfirmOptions | null>(null);

  useEffect(() => {
    globalShowConfirm = (opts) => {
      setConfig(opts);
    };
    return () => {
      globalShowConfirm = null;
    };
  }, []);

  if (!config) return null;

  const handleConfirm = () => {
    config.onConfirm();
    setConfig(null);
  };

  const handleCancel = () => {
    if (config.onCancel) config.onCancel();
    setConfig(null);
  };

  const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = config;

  return (
    <div className="modal-overlay">
      <div className="modal-content card card-glass" style={{ animation: 'pageIn 0.2s ease' }}>
        <h3 style={{ marginBottom: '8px', fontSize: '18px', color: danger ? 'var(--red)' : 'var(--text-primary)' }}>
          {title}
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px', lineHeight: '1.5' }}>
          {message}
        </p>
        
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={handleCancel}>
            {cancelText}
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
