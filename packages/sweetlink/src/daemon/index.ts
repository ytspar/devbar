#!/usr/bin/env node

/**
 * Daemon Entry Point
 *
 * This is the process that gets forked by the CLI.
 * It generates a token, picks a random port, starts the HTTP server,
 * writes the state file, and waits for commands.
 */

import * as crypto from 'crypto';
import { startServer } from './server.js';
import { removeDaemonState, releaseLock, writeDaemonState } from './stateFile.js';
import { DAEMON_PORT_MAX, DAEMON_PORT_MIN } from './types.js';

// ============================================================================
// Parse CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const url = getArg('--url') ?? 'http://localhost:3000';
const projectRoot = getArg('--project-root') ?? process.cwd();

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
        onShutdown: () => {
          console.error('[Daemon] Cleaning up state...');
          removeDaemonState(projectRoot);
          releaseLock(projectRoot);
          process.exit(0);
        },
      });

      // Write state file so the CLI can find us
      writeDaemonState(projectRoot, {
        pid: process.pid,
        port,
        token,
        startedAt: new Date().toISOString(),
        url,
        lastActivity: new Date().toISOString(),
      });

      console.error(`[Daemon] Started on port ${port} (PID: ${process.pid})`);
      console.error(`[Daemon] Target URL: ${url}`);
      console.error(`[Daemon] State file: ${projectRoot}/.sweetlink/daemon.json`);
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

// Handle graceful shutdown signals
process.on('SIGTERM', () => {
  console.error('[Daemon] Received SIGTERM');
  removeDaemonState(projectRoot);
  releaseLock(projectRoot);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[Daemon] Received SIGINT');
  removeDaemonState(projectRoot);
  releaseLock(projectRoot);
  process.exit(0);
});

main().catch((error) => {
  console.error('[Daemon] Fatal error:', error);
  removeDaemonState(projectRoot);
  releaseLock(projectRoot);
  process.exit(1);
});
