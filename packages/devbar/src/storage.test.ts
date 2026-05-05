import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteLocalStorageItem,
  deleteSessionStorageItem,
  getCookies,
  getLocalStorage,
  getSessionStorage,
  getStorageData,
  setLocalStorageItem,
  setSessionStorageItem,
} from './storage.js';

describe('localStorage utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getLocalStorage returns empty array when empty', () => {
    const items = getLocalStorage();
    expect(items).toEqual([]);
  });

  it('getLocalStorage returns items with metadata', () => {
    localStorage.setItem('testKey', 'testValue');
    const items = getLocalStorage();

    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('testKey');
    expect(items[0].value).toBe('testValue');
    expect(items[0].isParseable).toBe(false);
    expect(items[0].size).toBeGreaterThan(0);
  });

  it('getLocalStorage parses JSON values', () => {
    localStorage.setItem('jsonKey', JSON.stringify({ foo: 'bar' }));
    const items = getLocalStorage();

    expect(items[0].isParseable).toBe(true);
    expect(items[0].parsedValue).toEqual({ foo: 'bar' });
  });

  it('setLocalStorageItem sets a value', () => {
    setLocalStorageItem('newKey', 'newValue');
    expect(localStorage.getItem('newKey')).toBe('newValue');
  });

  it('deleteLocalStorageItem removes a value', () => {
    localStorage.setItem('toDelete', 'value');
    deleteLocalStorageItem('toDelete');
    expect(localStorage.getItem('toDelete')).toBeNull();
  });

  it('sorts items by key', () => {
    localStorage.setItem('zebra', '1');
    localStorage.setItem('apple', '2');
    localStorage.setItem('mango', '3');
    const items = getLocalStorage();

    expect(items[0].key).toBe('apple');
    expect(items[1].key).toBe('mango');
    expect(items[2].key).toBe('zebra');
  });
});

describe('sessionStorage utilities', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('getSessionStorage returns empty array when empty', () => {
    const items = getSessionStorage();
    expect(items).toEqual([]);
  });

  it('getSessionStorage returns items with metadata', () => {
    sessionStorage.setItem('sessionKey', 'sessionValue');
    const items = getSessionStorage();

    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('sessionKey');
    expect(items[0].value).toBe('sessionValue');
  });

  it('setSessionStorageItem sets a value', () => {
    setSessionStorageItem('newKey', 'newValue');
    expect(sessionStorage.getItem('newKey')).toBe('newValue');
  });

  it('deleteSessionStorageItem removes a value', () => {
    sessionStorage.setItem('toDelete', 'value');
    deleteSessionStorageItem('toDelete');
    expect(sessionStorage.getItem('toDelete')).toBeNull();
  });
});

describe('cookie utilities', () => {
  it('getCookies returns array', () => {
    const cookies = getCookies();
    expect(Array.isArray(cookies)).toBe(true);
  });
});

describe('getStorageData', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns all storage data', () => {
    localStorage.setItem('localKey', 'localValue');
    sessionStorage.setItem('sessionKey', 'sessionValue');

    const data = getStorageData();

    expect(data.localStorage).toHaveLength(1);
    expect(data.sessionStorage).toHaveLength(1);
    expect(Array.isArray(data.cookies)).toBe(true);
  });
});
