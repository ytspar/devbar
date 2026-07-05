/**
 * Type Guards Tests
 *
 * Tests for runtime type validation functions.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSweetlinkWsUrlCandidates,
  createSameOriginSweetlinkWsUrl,
  DEFAULT_WS_PORT,
  getErrorMessage,
  getSweetlinkRuntimeConfig,
  isConsoleLog,
  isDesignReviewScreenshotData,
  isHmrScreenshotData,
  isLocalDevelopmentHostname,
  isLocalDevelopmentOrigin,
  isSaveOutlineData,
  isSaveSchemaData,
  isSaveScreenshotData,
  isSaveSettingsData,
  isSweetlinkCommand,
  isUnsafeWsPort,
  localOriginMatchesAppPort,
  parsePortNumber,
  resolveAppPortFromLocalUrl,
  resolveAppPortFromLocation,
  resolveSweetlinkWsPortForAppPort,
  resolveSweetlinkWsPortFromLocation,
  SWEETLINK_WS_PATH,
  toSafeWsPort,
  WS_PORT_OFFSET,
} from './types.js';

describe('Type Guards', () => {
  describe('isSweetlinkCommand', () => {
    it('should return true for valid command', () => {
      expect(isSweetlinkCommand({ type: 'screenshot' })).toBe(true);
      expect(isSweetlinkCommand({ type: 'query-dom', selector: '.test' })).toBe(true);
    });

    it('should return false for invalid command', () => {
      expect(isSweetlinkCommand(null)).toBe(false);
      expect(isSweetlinkCommand(undefined)).toBe(false);
      expect(isSweetlinkCommand({})).toBe(false);
      expect(isSweetlinkCommand({ type: 123 })).toBe(false);
      expect(isSweetlinkCommand('screenshot')).toBe(false);
    });
  });

  describe('isConsoleLog', () => {
    it('should return true for valid console log', () => {
      expect(
        isConsoleLog({
          level: 'error',
          message: 'Test error',
          timestamp: Date.now(),
        })
      ).toBe(true);
    });

    it('should return false for invalid console log', () => {
      expect(isConsoleLog(null)).toBe(false);
      expect(isConsoleLog({})).toBe(false);
      expect(isConsoleLog({ level: 'error' })).toBe(false);
      expect(isConsoleLog({ level: 'error', message: 'test' })).toBe(false);
      expect(isConsoleLog({ level: 123, message: 'test', timestamp: 123 })).toBe(false);
    });
  });

  describe('isHmrScreenshotData', () => {
    it('should return true for valid HMR screenshot data', () => {
      expect(
        isHmrScreenshotData({
          trigger: 'file-change',
          screenshot: 'data:image/png;base64,...',
          url: 'http://localhost:3000',
          timestamp: Date.now(),
        })
      ).toBe(true);
    });

    it('should return false for invalid HMR screenshot data', () => {
      expect(isHmrScreenshotData(null)).toBe(false);
      expect(isHmrScreenshotData({})).toBe(false);
      expect(isHmrScreenshotData({ trigger: 'file-change' })).toBe(false);
    });
  });

  describe('isSaveScreenshotData', () => {
    it('should return true for valid screenshot save data', () => {
      expect(
        isSaveScreenshotData({
          screenshot: 'data:image/png;base64,...',
          url: 'http://localhost:3000',
          timestamp: Date.now(),
          width: 1920,
          height: 1080,
        })
      ).toBe(true);
    });

    it('should return false for missing required fields', () => {
      expect(isSaveScreenshotData(null)).toBe(false);
      expect(isSaveScreenshotData({})).toBe(false);
      expect(isSaveScreenshotData({ screenshot: 'data:...' })).toBe(false);
      expect(
        isSaveScreenshotData({
          screenshot: 'data:...',
          url: 'http://localhost',
          timestamp: 123,
        })
      ).toBe(false);
    });
  });

  describe('isSaveOutlineData', () => {
    it('should return true for valid outline save data', () => {
      expect(
        isSaveOutlineData({
          outline: [{ tagName: 'h1', text: 'Title' }],
          markdown: '# Title',
          url: 'http://localhost:3000',
          title: 'Test Page',
          timestamp: Date.now(),
        })
      ).toBe(true);
    });

    it('should return false for missing required fields', () => {
      expect(isSaveOutlineData(null)).toBe(false);
      expect(isSaveOutlineData({})).toBe(false);
      expect(isSaveOutlineData({ outline: [] })).toBe(false);
    });
  });

  describe('isSaveSchemaData', () => {
    it('should return true for valid schema save data', () => {
      expect(
        isSaveSchemaData({
          schema: { jsonLd: [], metaTags: {} },
          markdown: '## Schema',
          url: 'http://localhost:3000',
          title: 'Test Page',
          timestamp: Date.now(),
        })
      ).toBe(true);
    });

    it('should return false for missing required fields', () => {
      expect(isSaveSchemaData(null)).toBe(false);
      expect(isSaveSchemaData({})).toBe(false);
      expect(isSaveSchemaData({ schema: {} })).toBe(false);
    });
  });

  describe('isSaveSettingsData', () => {
    it('should return true for valid settings save data', () => {
      expect(isSaveSettingsData({ settings: { version: 1 } })).toBe(true);
      expect(isSaveSettingsData({ settings: {} })).toBe(true);
    });

    it('should return false for invalid settings data', () => {
      expect(isSaveSettingsData(null)).toBe(false);
      expect(isSaveSettingsData({})).toBe(false);
      expect(isSaveSettingsData({ settings: null })).toBe(false);
      expect(isSaveSettingsData({ settings: 'string' })).toBe(false);
    });
  });

  describe('isDesignReviewScreenshotData', () => {
    it('should return true for valid design review data', () => {
      expect(
        isDesignReviewScreenshotData({
          screenshot: 'data:image/png;base64,...',
          url: 'http://localhost:3000',
          timestamp: Date.now(),
          width: 1920,
          height: 1080,
        })
      ).toBe(true);
    });

    it('should return false for invalid design review data', () => {
      expect(isDesignReviewScreenshotData(null)).toBe(false);
      expect(isDesignReviewScreenshotData({})).toBe(false);
    });
  });
});

describe('Error Utilities', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error object', () => {
      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
    });

    it('should return string as-is', () => {
      expect(getErrorMessage('Direct error message')).toBe('Direct error message');
    });

    it('should return "Unknown error" for other types', () => {
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(undefined)).toBe('Unknown error');
      expect(getErrorMessage(123)).toBe('Unknown error');
      expect(getErrorMessage({ message: 'not an Error' })).toBe('Unknown error');
    });
  });
});

describe('Local Development URL Helpers', () => {
  it('parses valid port numbers only', () => {
    expect(parsePortNumber('3000')).toBe(3000);
    expect(parsePortNumber(5173)).toBe(5173);
    expect(parsePortNumber('3000abc')).toBeNull();
    expect(parsePortNumber('0')).toBeNull();
    expect(parsePortNumber('65536')).toBeNull();
    expect(parsePortNumber(undefined)).toBeNull();
  });

  it('recognizes localhost, loopback, and subdomain localhost hostnames', () => {
    expect(isLocalDevelopmentHostname('localhost')).toBe(true);
    expect(isLocalDevelopmentHostname('127.0.0.1')).toBe(true);
    expect(isLocalDevelopmentHostname('[::1]')).toBe(true);
    expect(isLocalDevelopmentHostname('security1000.localhost')).toBe(true);
    expect(isLocalDevelopmentHostname('security1000.test')).toBe(true);
    expect(isLocalDevelopmentHostname('security1000.local')).toBe(true);
    expect(isLocalDevelopmentHostname('example.com')).toBe(false);
    expect(isLocalDevelopmentHostname('localhost.example.com')).toBe(false);
  });

  it('resolves explicit and default app ports from browser locations', () => {
    expect(resolveAppPortFromLocation({ protocol: 'http:', port: '3000' })).toBe(3000);
    expect(resolveAppPortFromLocation({ protocol: 'http:', port: '' })).toBe(80);
    expect(resolveAppPortFromLocation({ protocol: 'https:', port: '' })).toBe(443);
    expect(resolveAppPortFromLocation({ protocol: 'file:', port: '' })).toBe(0);
  });

  it('keeps the existing app-port-plus-offset websocket port rule', () => {
    expect(resolveSweetlinkWsPortForAppPort(3000)).toBe(3000 + WS_PORT_OFFSET);
    expect(resolveSweetlinkWsPortForAppPort(null)).toBe(DEFAULT_WS_PORT);
    expect(resolveSweetlinkWsPortFromLocation({ protocol: 'http:', port: '1355' })).toBe(
      1355 + WS_PORT_OFFSET
    );
  });

  it('skips browser-restricted ports when deriving websocket ports', () => {
    // 443 + 6223 = 6666 (IRC) — Chrome refuses it with ERR_UNSAFE_PORT.
    expect(isUnsafeWsPort(6666)).toBe(true);
    expect(isUnsafeWsPort(9223)).toBe(false);
    // toSafeWsPort clears the whole 6665-6669 IRC block in one hop.
    expect(toSafeWsPort(6665)).toBe(6670);
    expect(toSafeWsPort(6666)).toBe(6670);
    expect(toSafeWsPort(9223)).toBe(9223);
    // 442 + 6223 = 6665 → bumped past the restricted block.
    expect(resolveSweetlinkWsPortForAppPort(442)).toBe(6670);
  });

  it('falls back to the default WS port behind proxies on protocol-default ports', () => {
    // https://places.localhost (Portless) → location port '' → app port 443.
    // Deriving 443 + 6223 = 6666 is both restricted AND wrong; the real dev
    // server port is unknowable, so use the default WS port instead.
    expect(resolveSweetlinkWsPortForAppPort(443)).toBe(DEFAULT_WS_PORT);
    expect(resolveSweetlinkWsPortForAppPort(80)).toBe(DEFAULT_WS_PORT);
    expect(resolveSweetlinkWsPortFromLocation({ protocol: 'https:', port: '' })).toBe(
      DEFAULT_WS_PORT
    );
  });

  it('reads injected Sweetlink runtime config for proxied dev servers', () => {
    const config = getSweetlinkRuntimeConfig({
      __SWEETLINK__: {
        appPort: 4123,
        wsPort: 10346,
        wsPath: SWEETLINK_WS_PATH,
      },
    });

    expect(config.appPort).toBe(4123);
    expect(config.wsPort).toBe(10346);
    expect(config.wsPath).toBe(SWEETLINK_WS_PATH);
  });

  it('reads NEXT_PUBLIC_SWEETLINK_* env hints injected by the Next.js plugin', () => {
    process.env.NEXT_PUBLIC_SWEETLINK_APP_PORT = '4836';
    process.env.NEXT_PUBLIC_SWEETLINK_WS_PORT = '11059';
    try {
      const config = getSweetlinkRuntimeConfig({});
      expect(config.appPort).toBe('4836');
      expect(config.wsPort).toBe('11059');
    } finally {
      delete process.env.NEXT_PUBLIC_SWEETLINK_APP_PORT;
      delete process.env.NEXT_PUBLIC_SWEETLINK_WS_PORT;
    }
  });

  it('orders WS candidates: explicit hint, same-origin path, then port math', () => {
    expect(
      buildSweetlinkWsUrlCandidates(
        { protocol: 'http:', port: '5173', host: 'localhost:5173' },
        { wsUrl: 'ws://localhost:11400', wsPath: SWEETLINK_WS_PATH, fallbackPort: 11396 }
      )
    ).toEqual(['ws://localhost:11400', 'ws://localhost:5173/__sweetlink', 'ws://localhost:11396']);
    expect(
      buildSweetlinkWsUrlCandidates(
        { protocol: 'http:', port: '3000', host: 'localhost:3000' },
        { wsPort: '9223', fallbackPort: 9223 }
      )
    ).toEqual(['ws://localhost:9223']);
  });

  it('always tries the same-origin path when the page has no explicit port', () => {
    // Proxied HTTPS origin (Portless): port math cannot locate the server,
    // so the conventional /__sweetlink endpoint must be attempted even
    // without an injected wsPath hint.
    expect(
      buildSweetlinkWsUrlCandidates(
        { protocol: 'https:', port: '', host: 'places.localhost' },
        { fallbackPort: DEFAULT_WS_PORT }
      )
    ).toEqual(['wss://places.localhost/__sweetlink', `ws://localhost:${DEFAULT_WS_PORT}`]);
  });

  it('creates same-origin websocket URLs for HTTP and HTTPS app origins', () => {
    expect(
      createSameOriginSweetlinkWsUrl({
        protocol: 'https:',
        host: 'security1000.localhost',
        port: '',
      })
    ).toBe('wss://security1000.localhost/__sweetlink');
    expect(
      createSameOriginSweetlinkWsUrl({
        protocol: 'http:',
        host: 'localhost:5173',
        port: '5173',
      })
    ).toBe('ws://localhost:5173/__sweetlink');
  });

  it('accepts Portless-style local origins and rejects external origins', () => {
    expect(isLocalDevelopmentOrigin('http://security1000.localhost:1355')).toBe(true);
    expect(isLocalDevelopmentOrigin('https://security1000.localhost')).toBe(true);
    expect(isLocalDevelopmentOrigin('https://security1000.test')).toBe(true);
    expect(isLocalDevelopmentOrigin('https://security1000.local')).toBe(true);
    expect(isLocalDevelopmentOrigin('http://localhost:3000')).toBe(true);
    expect(isLocalDevelopmentOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalDevelopmentOrigin('http://[::1]:3000')).toBe(true);
    expect(isLocalDevelopmentOrigin('https://security1000.com')).toBe(false);
    expect(isLocalDevelopmentOrigin('javascript:alert(1)')).toBe(false);
    expect(isLocalDevelopmentOrigin('data:text/html,hi')).toBe(false);
    expect(isLocalDevelopmentOrigin('//localhost:3000')).toBe(false);
    expect(isLocalDevelopmentOrigin('http://localhost:3000/path')).toBe(false);
    expect(isLocalDevelopmentOrigin('http://user:pass@localhost:3000')).toBe(false);
  });

  it('resolves app ports from local URLs for CLI env support', () => {
    expect(resolveAppPortFromLocalUrl('http://security1000.localhost:1355')).toBe(1355);
    expect(resolveAppPortFromLocalUrl('https://security1000.localhost')).toBe(443);
    expect(resolveAppPortFromLocalUrl('http://localhost')).toBe(80);
    expect(resolveAppPortFromLocalUrl('https://security1000.com')).toBeNull();
  });

  it('matches local origins by resolved app port', () => {
    expect(localOriginMatchesAppPort('http://security1000.localhost:1355', 1355)).toBe(true);
    expect(localOriginMatchesAppPort('https://security1000.localhost', 443)).toBe(true);
    expect(localOriginMatchesAppPort('http://localhost:3000', 5173)).toBe(false);
    expect(localOriginMatchesAppPort('https://security1000.com', 443)).toBe(false);
  });
});
