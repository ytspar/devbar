/**
 * App Version Plugin for DevBar
 *
 * Displays the current app/release version in the devbar toolbar.
 *
 * Usage:
 *   import { appVersionPlugin } from '@ytspar/devbar/plugins/app-version';
 *   const cleanup = appVersionPlugin('1.4.2');
 *   // later: cleanup();
 */

import { GlobalDevBar } from '../GlobalDevBar.js';

const CONTROL_ID = 'devbar-plugin-app-version';

export interface AppVersionPluginOptions {
  /** Custom label prefix (default: "v") */
  prefix?: string;
  /** Control variant for styling */
  variant?: 'default' | 'info' | 'warning';
  /** Callback when the version badge is clicked */
  onClick?: (version: string) => void;
}

/**
 * Activate the app version plugin.
 * @param version - The version string to display (e.g. "1.4.2", "2.0.0-beta.1")
 * @param options - Optional configuration
 * @returns A cleanup function that unregisters the control.
 */
export function appVersionPlugin(
  version: string,
  options: AppVersionPluginOptions = {}
): () => void {
  const { prefix = 'v', variant = 'default', onClick } = options;

  GlobalDevBar.registerControl({
    id: CONTROL_ID,
    label: `${prefix}${version}`,
    variant,
    onClick: onClick ? () => onClick(version) : undefined,
  });

  return () => {
    GlobalDevBar.unregisterControl(CONTROL_ID);
  };
}
