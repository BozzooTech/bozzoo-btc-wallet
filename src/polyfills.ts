import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
  if (typeof window.process === 'undefined') {
    window.process = require('process/browser');
  }
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  // Service worker environment (background.ts)
  (self as any).Buffer = (self as any).Buffer || Buffer;
  if (typeof (self as any).process === 'undefined') {
    (self as any).process = require('process/browser');
  }
}
