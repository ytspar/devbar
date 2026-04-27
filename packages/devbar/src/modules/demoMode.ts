/**
 * Helpers for demo-only Sweetlink simulation used by the playground website.
 *
 * The devbar package should keep behaving normally for consumers; these helpers
 * only read an optional browser flag set by the playground shim.
 */

type DemoWindow = Window & { __devbarSweetlinkDemo?: boolean };

export function isSweetlinkDemoMode(): boolean {
  return typeof window !== 'undefined' && (window as DemoWindow).__devbarSweetlinkDemo === true;
}

export function isDemoArtifactPath(path: string): boolean {
  return (
    isSweetlinkDemoMode() ||
    path.startsWith('.sweetlink/demo/') ||
    path.includes('/.sweetlink/demo/')
  );
}

export function getDemoArtifactWarning(): string {
  return 'Demo only: no local file was written.';
}

export function getSweetlinkConnectionTooltip(connected: boolean, actionText?: string): string {
  if (connected && isSweetlinkDemoMode()) {
    return `Sweetlink demo mode: simulated bridge, sample artifacts only${actionText ? ` (${actionText})` : ''}`;
  }
  return connected
    ? `Sweetlink connected${actionText ? ` (${actionText})` : ''}`
    : `Sweetlink disconnected${actionText ? ` (${actionText})` : ''}`;
}
