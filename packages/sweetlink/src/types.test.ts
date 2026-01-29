/**
 * Type Guards Tests
 *
 * Tests for runtime type validation functions.
 */

import { describe, expect, it } from 'vitest';
import {
  getErrorMessage,
  isConsoleLog,
  isDesignReviewScreenshotData,
  isHmrScreenshotData,
  isSaveOutlineData,
  isSaveSchemaData,
  isSaveScreenshotData,
  isSaveSettingsData,
  isSweetlinkCommand,
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
