// @vitest-environment node

/**
 * Project-Local Server Discovery Tests
 *
 * Exercises the .sweetlink/server.json write/read/remove/stale paths
 * against a real (temp-dir) filesystem.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findServerInfoFile,
  parseServerInfoFile,
  removeServerInfoFile,
  type ServerInfoFile,
  serverInfoFilePath,
  writeServerInfoFile,
} from './discovery.js';

let tmpDir: string;

function makeInfo(overrides: Partial<ServerInfoFile> = {}): ServerInfoFile {
  return {
    wsPort: 10888,
    appPort: 4665,
    publicUrl: 'https://places.localhost',
    pid: process.pid,
    startedAt: new Date().toISOString(),
    version: '1.0.0',
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweetlink-discovery-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeServerInfoFile / findServerInfoFile', () => {
  it('round-trips the server info through .sweetlink/server.json', () => {
    const info = makeInfo();
    writeServerInfoFile(tmpDir, info);

    const found = findServerInfoFile(tmpDir);
    expect(found).not.toBeNull();
    expect(found!.projectRoot).toBe(tmpDir);
    expect(found!.filePath).toBe(serverInfoFilePath(tmpDir));
    expect(found!.info).toEqual(info);
  });

  it('walks up from a nested cwd to the project root', () => {
    writeServerInfoFile(tmpDir, makeInfo());
    const nested = path.join(tmpDir, 'apps', 'web', 'src');
    fs.mkdirSync(nested, { recursive: true });

    const found = findServerInfoFile(nested);
    expect(found?.projectRoot).toBe(tmpDir);
    expect(found?.info.wsPort).toBe(10888);
  });

  it('returns null when no server.json exists anywhere up the tree', () => {
    expect(findServerInfoFile(tmpDir)).toBeNull();
  });

  it('ignores corrupt or shape-invalid files', () => {
    const filePath = serverInfoFilePath(tmpDir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFileSync(filePath, 'not json at all');
    expect(findServerInfoFile(tmpDir)).toBeNull();

    fs.writeFileSync(filePath, JSON.stringify({ wsPort: 'nope', pid: -1 }));
    expect(findServerInfoFile(tmpDir)).toBeNull();
  });

  it('does not throw when the directory is not writable', () => {
    expect(() => writeServerInfoFile('/nonexistent-root-path/\0bad', makeInfo())).not.toThrow();
  });
});

describe('parseServerInfoFile', () => {
  it('requires a valid wsPort and pid', () => {
    expect(parseServerInfoFile(JSON.stringify({ wsPort: 10888 }))).toBeNull();
    expect(parseServerInfoFile(JSON.stringify({ pid: 123 }))).toBeNull();
    expect(parseServerInfoFile(JSON.stringify({ wsPort: 0, pid: 123 }))).toBeNull();
    expect(parseServerInfoFile('null')).toBeNull();
  });

  it('normalizes optional fields', () => {
    const parsed = parseServerInfoFile(JSON.stringify({ wsPort: 9223, pid: 42 }));
    expect(parsed).toEqual({
      wsPort: 9223,
      appPort: null,
      publicUrl: undefined,
      pid: 42,
      startedAt: '',
      version: '',
    });
  });
});

describe('removeServerInfoFile', () => {
  it('removes the file written by this pid', () => {
    writeServerInfoFile(tmpDir, makeInfo({ pid: 1234 }));
    removeServerInfoFile(tmpDir, 1234);
    expect(fs.existsSync(serverInfoFilePath(tmpDir))).toBe(false);
  });

  it("leaves another pid's file in place (restarted server wins)", () => {
    // A slow shutdown of the old server (pid 1111) must not delete the file
    // the freshly restarted server (pid 2222) just wrote.
    writeServerInfoFile(tmpDir, makeInfo({ pid: 2222 }));
    removeServerInfoFile(tmpDir, 1111);
    expect(fs.existsSync(serverInfoFilePath(tmpDir))).toBe(true);
  });

  it('is a no-op when the file does not exist', () => {
    expect(() => removeServerInfoFile(tmpDir, 1234)).not.toThrow();
  });
});
