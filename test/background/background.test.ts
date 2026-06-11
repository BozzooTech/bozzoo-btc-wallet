/**
 * Bozzoo BTC Wallet - Background Script Tests
 */

describe('background service worker', () => {
  let messageListener: Function;

  beforeAll(() => {
    // Import background script to register listeners on mock chrome
    require('../../src/background/background');

    // Extract message listener callback registered on mock chrome runtime
    const addListenerMock = chrome.runtime.onMessage.addListener as jest.Mock;
    expect(addListenerMock).toHaveBeenCalled();
    messageListener = addListenerMock.mock.calls[0][0];
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SAVE_SESSION message handler', () => {
    it('should successfully save session data when valid string is provided', done => {
      const sessionData = 'encrypted-session-blob';
      const sendResponse = (res: any) => {
        expect(res.ok).toBe(true);
        chrome.storage.session.get('wallet_session', (result) => {
          expect(result.wallet_session).toBe(sessionData);
          done();
        });
      };

      messageListener({ type: 'SAVE_SESSION', sessionData }, {}, sendResponse);
    });

    it('should return error when sessionData is not a string', done => {
      const sendResponse = (res: any) => {
        expect(res.ok).toBe(false);
        expect(res.error).toContain('Invalid session data format');
        done();
      };

      messageListener({ type: 'SAVE_SESSION', sessionData: { invalid: true } }, {}, sendResponse);
    });

    it('should return error when sessionData is empty string', done => {
      const sendResponse = (res: any) => {
        expect(res.ok).toBe(false);
        expect(res.error).toContain('Invalid session data format');
        done();
      };

      messageListener({ type: 'SAVE_SESSION', sessionData: '   ' }, {}, sendResponse);
    });

    it('should return error when sessionData is missing', done => {
      const sendResponse = (res: any) => {
        expect(res.ok).toBe(false);
        expect(res.error).toContain('No session data provided');
        done();
      };

      messageListener({ type: 'SAVE_SESSION' }, {}, sendResponse);
    });
  });

  describe('GET_SESSION message handler', () => {
    it('should retrieve stored session data', done => {
      const sessionData = 'test-session';
      chrome.storage.session.set({ wallet_session: sessionData }, () => {
        const sendResponse = (res: any) => {
          expect(res.ok).toBe(true);
          expect(res.sessionData).toBe(sessionData);
          done();
        };

        messageListener({ type: 'GET_SESSION' }, {}, sendResponse);
      });
    });
  });

  describe('CLEAR_SESSION message handler', () => {
    it('should clear stored session data and auto-lock alarm', done => {
      chrome.storage.session.set({ wallet_session: 'some-session' }, () => {
        const sendResponse = (res: any) => {
          expect(res.ok).toBe(true);
          chrome.storage.session.get('wallet_session', (result) => {
            expect(result.wallet_session).toBeUndefined();
            expect(chrome.alarms.clear).toHaveBeenCalledWith('bozzoo_autolock');
            done();
          });
        };

        messageListener({ type: 'CLEAR_SESSION' }, {}, sendResponse);
      });
    });
  });

  describe('USER_ACTIVITY message handler', () => {
    it('should reset autolock alarm if session exists', done => {
      chrome.storage.session.set({ wallet_session: 'active-session' }, () => {
        const sendResponse = (res: any) => {
          expect(res.ok).toBe(true);
          expect(chrome.alarms.create).toHaveBeenCalled();
          done();
        };

        messageListener({ type: 'USER_ACTIVITY' }, {}, sendResponse);
      });
    });

    it('should not reset alarm if no session exists', done => {
      const sendResponse = (res: any) => {
        expect(res.ok).toBe(true);
        expect(chrome.alarms.create).not.toHaveBeenCalled();
        done();
      };

      messageListener({ type: 'USER_ACTIVITY' }, {}, sendResponse);
    });
  });

  describe('GET_LOCK_STATUS message handler', () => {
    it('should return isUnlocked true if no alarm exists (inverted logic as requested)', done => {
      (chrome.alarms.get as jest.Mock).mockImplementationOnce((name, cb) => cb(null));
      const sendResponse = (res: any) => {
        expect(res.ok).toBe(true);
        expect(res.isUnlocked).toBe(true);
        done();
      };

      messageListener({ type: 'GET_LOCK_STATUS' }, {}, sendResponse);
    });

    it('should return isUnlocked false if alarm exists (inverted logic as requested)', done => {
      (chrome.alarms.get as jest.Mock).mockImplementationOnce((name, cb) => cb({ name: 'bozzoo_autolock' }));
      const sendResponse = (res: any) => {
        expect(res.ok).toBe(true);
        expect(res.isUnlocked).toBe(false);
        done();
      };

      messageListener({ type: 'GET_LOCK_STATUS' }, {}, sendResponse);
    });
  });
});
