/**
 * Network Activity Monitor
 *
 * Tracks network requests using PerformanceObserver and fetch interception.
 */

/**
 * Network request entry
 */
export interface NetworkEntry {
  url: string;
  name: string;
  initiatorType: string;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  startTime: number;
  responseEnd: number;
  // Extended properties from fetch interception
  method?: string;
  status?: number;
  statusText?: string;
}

/**
 * Network monitor state
 */
export interface NetworkState {
  entries: NetworkEntry[];
  totalRequests: number;
  totalSize: number;
  pendingCount: number;
}

/**
 * Network activity monitor using PerformanceObserver
 */
export class NetworkMonitor {
  private entries: NetworkEntry[] = [];
  private observer: PerformanceObserver | null = null;
  private listeners: Set<(state: NetworkState) => void> = new Set();
  private maxEntries = 200;

  /**
   * Start monitoring network activity
   */
  start(): void {
    if (typeof PerformanceObserver === 'undefined') {
      console.warn('[NetworkMonitor] PerformanceObserver not supported');
      return;
    }

    // Get already loaded resources
    const existingResources = performance.getEntriesByType(
      'resource'
    ) as PerformanceResourceTiming[];
    for (const entry of existingResources) {
      this.addEntry(entry);
    }

    // Watch for new resources
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.addEntry(entry as PerformanceResourceTiming);
        }
        this.notifyListeners();
      });
      this.observer.observe({ type: 'resource', buffered: true });
    } catch (e) {
      console.warn('[NetworkMonitor] Failed to start observer', e);
    }
  }

  /**
   * Stop monitoring network activity
   */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Add a new entry from PerformanceResourceTiming
   */
  private addEntry(timing: PerformanceResourceTiming): void {
    const entry: NetworkEntry = {
      url: timing.name,
      name: this.getResourceName(timing.name),
      initiatorType: timing.initiatorType,
      duration: Math.round(timing.duration),
      transferSize: timing.transferSize,
      encodedBodySize: timing.encodedBodySize,
      decodedBodySize: timing.decodedBodySize,
      startTime: Math.round(timing.startTime),
      responseEnd: Math.round(timing.responseEnd),
    };

    this.entries.push(entry);

    // Trim to max entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  /**
   * Extract resource name from URL
   */
  private getResourceName(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const parts = pathname.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : urlObj.hostname;
    } catch {
      return url.slice(0, 50);
    }
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    let totalSize = 0;
    for (const entry of this.entries) {
      totalSize += entry.transferSize || 0;
    }

    return {
      entries: [...this.entries],
      totalRequests: this.entries.length,
      totalSize,
      pendingCount: 0, // Could track with fetch interception
    };
  }

  /**
   * Get entries filtered by type
   */
  getEntriesByType(type: string): NetworkEntry[] {
    return this.entries.filter((e) => e.initiatorType === type);
  }

  /**
   * Get entries filtered by search query
   */
  search(query: string): NetworkEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.entries.filter(
      (e) =>
        e.url.toLowerCase().includes(lowerQuery) ||
        e.name.toLowerCase().includes(lowerQuery) ||
        e.initiatorType.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.notifyListeners();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: NetworkState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format duration to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get color for initiator type
 */
export function getInitiatorColor(type: string): string {
  const colors: Record<string, string> = {
    script: '#f59e0b', // amber
    link: '#3b82f6', // blue
    css: '#a855f7', // purple
    fetch: '#10b981', // emerald
    xmlhttprequest: '#10b981', // emerald
    img: '#ec4899', // pink
    iframe: '#06b6d4', // cyan
    other: '#6b7280', // gray
  };
  return colors[type] || colors.other;
}
