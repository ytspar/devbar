/**
 * Storage Inspector Utilities
 *
 * Utilities for inspecting and managing browser storage (localStorage, sessionStorage, cookies).
 */

/**
 * Storage item with parsed value
 */
export interface StorageItem {
  key: string;
  value: string;
  parsedValue?: unknown;
  isParseable: boolean;
  size: number;
}

/**
 * Cookie item
 */
export interface CookieItem {
  name: string;
  value: string;
  size: number;
}

/**
 * Storage data from all sources
 */
export interface StorageData {
  localStorage: StorageItem[];
  sessionStorage: StorageItem[];
  cookies: CookieItem[];
}

/**
 * Try to parse a JSON string
 */
function tryParseJson(value: string): { parsed: unknown; success: boolean } {
  try {
    const parsed = JSON.parse(value);
    return { parsed, success: true };
  } catch {
    return { parsed: undefined, success: false };
  }
}

/**
 * Get all items from a Storage object (localStorage or sessionStorage)
 */
function getStorageItems(storage: Storage): StorageItem[] {
  const items: StorageItem[] = [];

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null) continue;

    const value = storage.getItem(key) ?? '';
    const { parsed, success } = tryParseJson(value);

    items.push({
      key,
      value,
      parsedValue: success ? parsed : undefined,
      isParseable: success,
      size: new Blob([value]).size,
    });
  }

  // Sort by key
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Get all localStorage items
 */
export function getLocalStorage(): StorageItem[] {
  if (typeof localStorage === 'undefined') return [];
  return getStorageItems(localStorage);
}

/**
 * Get all sessionStorage items
 */
export function getSessionStorage(): StorageItem[] {
  if (typeof sessionStorage === 'undefined') return [];
  return getStorageItems(sessionStorage);
}

/**
 * Get all cookies
 */
export function getCookies(): CookieItem[] {
  if (typeof document === 'undefined' || !document.cookie) return [];

  return document.cookie
    .split(';')
    .map((cookie) => {
      const [name, ...valueParts] = cookie.trim().split('=');
      const value = valueParts.join('=');
      return {
        name: name.trim(),
        value: decodeURIComponent(value || ''),
        size: new Blob([value || '']).size,
      };
    })
    .filter((c) => c.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get all storage data from all sources
 */
export function getStorageData(): StorageData {
  return {
    localStorage: getLocalStorage(),
    sessionStorage: getSessionStorage(),
    cookies: getCookies(),
  };
}

/**
 * Set a localStorage item
 */
export function setLocalStorageItem(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value);
}

/**
 * Delete a localStorage item
 */
export function deleteLocalStorageItem(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key);
}

/**
 * Set a sessionStorage item
 */
export function setSessionStorageItem(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(key, value);
}

/**
 * Delete a sessionStorage item
 */
export function deleteSessionStorageItem(key: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(key);
}

/**
 * Delete a cookie by name
 */
export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

/**
 * Clear all localStorage
 */
export function clearLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.clear();
}

/**
 * Clear all sessionStorage
 */
export function clearSessionStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.clear();
}

/**
 * Format storage size summary
 */
export function formatStorageSummary(data: StorageData): string {
  const localSize = data.localStorage.reduce((sum, item) => sum + item.size, 0);
  const sessionSize = data.sessionStorage.reduce((sum, item) => sum + item.size, 0);
  const cookieSize = data.cookies.reduce((sum, item) => sum + item.size, 0);

  const parts: string[] = [];
  if (data.localStorage.length > 0) {
    parts.push(`localStorage: ${data.localStorage.length} items (${formatBytes(localSize)})`);
  }
  if (data.sessionStorage.length > 0) {
    parts.push(`sessionStorage: ${data.sessionStorage.length} items (${formatBytes(sessionSize)})`);
  }
  if (data.cookies.length > 0) {
    parts.push(`cookies: ${data.cookies.length} (${formatBytes(cookieSize)})`);
  }

  return parts.join(' | ') || 'No storage data';
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Beautify JSON string for display
 */
export function beautifyJson(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}
