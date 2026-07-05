#!/usr/bin/env node

/**
 * Daemon Entry Point
 *
 * This is the process that gets forked by the CLI.
 * It generates a token, picks a random port, starts the HTTP server,
 * writes the state file, and waits for commands.
 */

import * as crypto from 'crypto';
import { closeBrowser, setHeadedMode } from './browser.js';
import { shutdown, startServer } from './server.js';
import { extractPort, releaseLock, removeDaemonState, writeDaemonState } from './stateFile.js';
import { DAEMON_PORT_MAX, DAEMON_PORT_MIN } from './types.js';
import { registerGracefulShutdown } from './utils.js';

// ============================================================================
// Parse CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return args.includes(name);
}

const url = getArg('--url') ?? 'http://localhost:3000';
const projectRoot = getArg('--project-root') ?? process.cwd();
const headed = hasFlag('--headed');
const appPort = extractPort(url);

// Configure headed mode before any browser init
if (headed) {
  setHeadedMode(true);
  console.error('[Daemon] Headed mode enabled — browser window will be visible');
}

// ============================================================================
// Startup
// ============================================================================

function randomPort(): number {
  return DAEMON_PORT_MIN + Math.floor(Math.random() * (DAEMON_PORT_MAX - DAEMON_PORT_MIN));
}

async function main(): Promise<void> {
  const token = crypto.randomBytes(16).toString('hex');
  const maxRetries = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const port = randomPort();

    try {
      await startServer({
        port,
        token,
        url,
        projectRoot,
        // Write state file synchronously inside the listen callback so the
        // CLI never observes "port open, state missing".
        onListening: () => {
          writeDaemonState(
            projectRoot,
            {
              pid: process.pid,
              port,
              token,
              startedAt: new Date().toISOString(),
              url,
              lastActivity: new Date().toISOString(),
            },
            appPort
          );
        },
        onShutdown: () => {
          console.error('[Daemon] Cleaning up state...');
          removeDaemonState(projectRoot, appPort);
          releaseLock(projectRoot, appPort);
          process.exit(0);
        },
      });

      const stateFileName = appPort ? `daemon-${appPort}.json` : 'daemon.json';
      console.error(`[Daemon] Started on port ${port} (PID: ${process.pid})`);
      console.error(`[Daemon] Target URL: ${url}`);
      console.error(`[Daemon] State file: ${projectRoot}/.sweetlink/${stateFileName}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('in use') && attempt < maxRetries - 1) {
        console.error(`[Daemon] Port ${port} in use, retrying...`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to find available port after ${maxRetries} attempts`);
}

// Handle graceful shutdown signals — same cleanup for SIGTERM and SIGINT.
// Must go through shutdown() (which closes the Playwright browser) rather
// than exiting directly: a bare process.exit() here left an orphaned
// headless page alive and WS-connected to the sweetlink server, which later
// Tier-1 screenshot commands silently captured instead of the real target.
registerGracefulShutdown(() => {
  console.error('[Daemon] Received shutdown signal');
  // Watchdog: never hang on a stuck browser close. unref() so it doesn't
  // keep the process alive once cleanup finishes naturally.
  const forceExit = setTimeout(() => process.exit(1), 5000);
  forceExit.unref();
  shutdown()
    .catch(() => {})
    .finally(() => {
      // shutdown() normally exits via onShutdown; this is the fallback for
      // signals that arrive before the server registered its callback.
      removeDaemonState(projectRoot, appPort);
      releaseLock(projectRoot, appPort);
      process.exit(0);
    });
});

main().catch(async (error) => {
  console.error('[Daemon] Fatal error:', error);
  await closeBrowser().catch(() => {});
  removeDaemonState(projectRoot, appPort);
  releaseLock(projectRoot, appPort);
  process.exit(1);
});
