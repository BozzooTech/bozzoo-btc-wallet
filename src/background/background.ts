/**
 * Bozzoo BTC Wallet - Background Service Worker (TypeScript)
 *
 * Handles:
 *  - Auto-lock alarm (10-minute inactivity timer)
 *  - Badge state (locked/unlocked visual indicator)
 *  - Message passing with the popup for session persistence
 */

import '../polyfills';

const ALARM_NAME = 'bozzoo_autolock' as const;
const AUTO_LOCK_MINUTES = 10;
const SESSION_KEY = 'wallet_session';

type MessageType =
  | 'USER_ACTIVITY'
  | 'WALLET_LOCKED'
  | 'WALLET_UNLOCKED'
  | 'GET_LOCK_STATUS'
  | 'SAVE_SESSION'
  | 'GET_SESSION'
  | 'CLEAR_SESSION';

interface BackgroundMessage {
  type: MessageType;
  sessionData?: any;
}

interface BackgroundResponse {
  ok: boolean;
  isUnlocked?: boolean;
  sessionData?: any;
  error?: string;
}

//  Alarm Management 

function resetAutoLockAlarm(): void {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, { delayInMinutes: AUTO_LOCK_MINUTES });
  });
}

function clearAutoLockAlarm(): void {
  chrome.alarms.clear(ALARM_NAME);
}

const action = chrome.browserAction || chrome.action;

// When an error occurs or connection is dropped
function setDisconnectedState() {
  if (action?.setBadgeText) action.setBadgeText({ text: '🔒' });
  if (action?.setBadgeBackgroundColor) action.setBadgeBackgroundColor({ color: '#F7931A' });
}

function setConnectedState() {
  if (action?.setBadgeText) action.setBadgeText({ text: '' });
}

//  Badge Helpers 

function setBadgeLocked(): void {
  action.setBadgeText({ text: '🔒' });
  action.setBadgeBackgroundColor({ color: '#F7931A' });
}

function setBadgeUnlocked(): void {
  action.setBadgeText({ text: '' });
}

//  Event Listeners 

chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm.name === ALARM_NAME) {
    // Clear session storage on auto lock
    chrome.storage.session.remove(SESSION_KEY, () => {
      // Notify any open popup that the session has expired
      chrome.runtime.sendMessage({ type: 'AUTO_LOCK' }).catch(() => {
        // Popup may be closed - ignore the error
      });
      setBadgeLocked();
    });
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void
  ): boolean => {

    switch (message.type) {
      case 'SAVE_SESSION':
        if (message.sessionData) {
          chrome.storage.session.set({ [SESSION_KEY]: message.sessionData }, () => {
            resetAutoLockAlarm();
            setBadgeUnlocked();
            sendResponse({ ok: true });
          });
        } else {
          sendResponse({ ok: false, error: 'No session data provided' });
        }
        return true; // keep channel open

      case 'GET_SESSION':
        chrome.storage.session.get(SESSION_KEY, (result) => {
          sendResponse({ ok: true, sessionData: result[SESSION_KEY] });
        });
        return true; // keep channel open

      case 'CLEAR_SESSION':
        chrome.storage.session.remove(SESSION_KEY, () => {
          clearAutoLockAlarm();
          setBadgeLocked();
          sendResponse({ ok: true });
        });
        return true; // keep channel open

      case 'USER_ACTIVITY':
        // Only reset if session exists
        chrome.storage.session.get(SESSION_KEY, (result) => {
          if (result[SESSION_KEY]) {
            resetAutoLockAlarm();
            setBadgeUnlocked();
          }
          sendResponse({ ok: true });
        });
        return true;

      case 'WALLET_LOCKED':
        clearAutoLockAlarm();
        setBadgeLocked();
        sendResponse({ ok: true });
        return false;

      case 'WALLET_UNLOCKED':
        resetAutoLockAlarm();
        setBadgeUnlocked();
        sendResponse({ ok: true });
        return false;

      case 'GET_LOCK_STATUS':
        chrome.alarms.get(ALARM_NAME, (alarm) => {
          sendResponse({ ok: true, isUnlocked: Boolean(alarm) });
        });
        return true; // keep channel open for async response

      default:
        sendResponse({ ok: false, error: 'Unknown message type.' });
        return false;
    }
  }
);

// chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
//   if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
//     // Firefox does not support programmatic openPopup, so we do nothing here.
//     // The user will need to click the extension icon.
//   }
// });
