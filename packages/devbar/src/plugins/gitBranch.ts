/**
 * Git Branch Plugin for DevBar
 *
 * Displays the current git branch name in the devbar toolbar.
 * Reads the branch from the Sweetlink server-info (stored on the devbar instance).
 *
 * Usage:
 *   import { gitBranchPlugin } from '@ytspar/devbar/plugins/git-branch';
 *   const cleanup = gitBranchPlugin();
 *   // later: cleanup();
 */

import { GlobalDevBar, getGlobalDevBar } from '../GlobalDevBar.js';

const CONTROL_ID = 'devbar-plugin-git-branch';
const POLL_INTERVAL = 2000;

export interface GitBranchPluginOptions {
  /** Custom label prefix (default: branch icon) */
  prefix?: string;
  /** Control variant for styling */
  variant?: 'default' | 'info' | 'warning';
  /** Callback when the branch badge is clicked */
  onClick?: (branch: string) => void;
}

/**
 * Activate the git branch plugin.
 * Returns a cleanup function that unregisters the control and stops polling.
 */
export function gitBranchPlugin(options: GitBranchPluginOptions = {}): () => void {
  const { prefix = '\u{E0A0}', variant = 'info', onClick } = options;

  let lastBranch: string | null = null;
  let stopped = false;

  function update(): void {
    if (stopped) return;

    const instance = getGlobalDevBar();
    const branch = instance?.serverGitBranch ?? null;

    if (branch === lastBranch) return;
    lastBranch = branch;

    if (branch) {
      GlobalDevBar.registerControl({
        id: CONTROL_ID,
        label: `${prefix} ${branch}`,
        variant,
        onClick: onClick ? () => onClick(branch) : undefined,
      });
    } else {
      GlobalDevBar.unregisterControl(CONTROL_ID);
    }
  }

  // Initial check
  update();

  // Poll for changes (branch becomes available after WS connects)
  const interval = setInterval(update, POLL_INTERVAL);

  return () => {
    stopped = true;
    clearInterval(interval);
    GlobalDevBar.unregisterControl(CONTROL_ID);
  };
}
