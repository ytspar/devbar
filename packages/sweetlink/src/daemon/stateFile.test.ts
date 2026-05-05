// @vitest-environment node

/**
 * Daemon State File Tests
 *
 * Tests state file read/write/remove and lock acquire/release.
 * Mocks the fs module to avoid real filesystem operations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFs } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('fs', () => mockFs);

import {
  acquireLock,
  getLockFilePath,
  getStateDir,
  getStateFilePath,
  readDaemonState,
  releaseLock,
  removeDaemonState,
  writeDaemonState,
} from './stateFile.js';
import type { DaemonState } from './types.js';

const VALID_STATE: DaemonState = {
  pid: 12345,
  port: 10001,
  token: 'abc123',
  startedAt: '2024-01-01T00:00:00.000Z',
  url: 'http://localhost:3000',
  lastActivity: '2024-01-01T00:01:00.000Z',
};

describe('path helpers', () => {
  it('getStateDir joins project root with .sweetlink', () => {
    expect(getStateDir('/my/project')).toBe('/my/project/.sweetlink');
  });

  it('getStateFilePath returns daemon.json path', () => {
    expect(getStateFilePath('/my/project')).toBe('/my/project/.sweetlink/daemon.json');
  });

  it('getLockFilePath returns daemon.lock path', () => {
    expect(getLockFilePath('/my/project')).toBe('/my/project/.sweetlink/daemon.lock');
  });
});

describe('writeDaemonState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    writeDaemonState('/project', VALID_STATE);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/project/.sweetlink', { recursive: true });
  });

  it('skips mkdir if directory exists', () => {
    mockFs.existsSync.mockReturnValue(true);
    writeDaemonState('/project', VALID_STATE);
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  it('writes to tmp file then renames atomically', () => {
    mockFs.existsSync.mockReturnValue(true);
    writeDaemonState('/project', VALID_STATE);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      '/project/.sweetlink/daemon.json.tmp',
      expect.any(String),
      { mode: 0o600 }
    );
    expect(mockFs.renameSync).toHaveBeenCalledWith(
      '/project/.sweetlink/daemon.json.tmp',
      '/project/.sweetlink/daemon.json'
    );
  });

  it('writes valid JSON', () => {
    mockFs.existsSync.mockReturnValue(true);
    writeDaemonState('/project', VALID_STATE);

    const writtenContent = mockFs.writeFileSync.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.pid).toBe(12345);
    expect(parsed.token).toBe('abc123');
  });
});

describe('readDaemonState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed state for valid file', () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify(VALID_STATE));
    const result = readDaemonState('/project');
    expect(result).toEqual(VALID_STATE);
  });

  it('returns null when file does not exist', () => {
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(readDaemonState('/project')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    mockFs.readFileSync.mockReturnValue('not json {{{');
    expect(readDaemonState('/project')).toBeNull();
  });

  it('returns null when pid is missing', () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ port: 10001, token: 'abc', startedAt: 'x', url: 'y' })
    );
    expect(readDaemonState('/project')).toBeNull();
  });

  it('returns null when port is not a number', () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ pid: 1, port: 'bad', token: 'abc', startedAt: 'x', url: 'y' })
    );
    expect(readDaemonState('/project')).toBeNull();
  });

  it('returns null when token is not a string', () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ pid: 1, port: 10001, token: 123, startedAt: 'x', url: 'y' })
    );
    expect(readDaemonState('/project')).toBeNull();
  });

  it('returns null when startedAt is missing', () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ pid: 1, port: 10001, token: 'abc', url: 'y' })
    );
    expect(readDaemonState('/project')).toBeNull();
  });

  it('returns null when url is missing', () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ pid: 1, port: 10001, token: 'abc', startedAt: 'x' })
    );
    expect(readDaemonState('/project')).toBeNull();
  });
});

describe('removeDaemonState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes both state file and lock file', () => {
    removeDaemonState('/project');
    expect(mockFs.unlinkSync).toHaveBeenCalledWith('/project/.sweetlink/daemon.json');
    expect(mockFs.unlinkSync).toHaveBeenCalledWith('/project/.sweetlink/daemon.lock');
  });

  it('does not throw if files do not exist', () => {
    mockFs.unlinkSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => removeDaemonState('/project')).not.toThrow();
  });
});

describe('acquireLock', () => {
  beforeEach(() => vi.resetAllMocks());

  // Lock content format is `${pid}:${token}` where token is random per
  // call. Helper records what was written so verifyLockOwnership can read
  // it back during the same test.
  function trackLockWrites(): { lastContent(): string | undefined } {
    let lastWritten: string | undefined;
    mockFs.writeFileSync.mockImplementation((file: string, content: string) => {
      if (typeof content === 'string' && file.endsWith('daemon.lock')) {
        lastWritten = content;
      }
    });
    mockFs.readFileSync.mockImplementation((file: string) => {
      if (typeof file === 'string' && file.endsWith('daemon.lock') && lastWritten !== undefined) {
        return lastWritten;
      }
      throw new Error('ENOENT');
    });
    return { lastContent: () => lastWritten };
  }

  it('creates directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    trackLockWrites();
    acquireLock('/project');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/project/.sweetlink', { recursive: true });
  });

  it('returns true when lock is acquired', () => {
    mockFs.existsSync.mockReturnValue(true);
    trackLockWrites();
    expect(acquireLock('/project')).toBe(true);
  });

  it('writes PID:token content to lock file with wx flag', () => {
    mockFs.existsSync.mockReturnValue(true);
    const tracker = trackLockWrites();
    acquireLock('/project');

    // Token is random per call; assert format and PID prefix.
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      '/project/.sweetlink/daemon.lock',
      expect.stringMatching(new RegExp(`^${process.pid}:[a-f0-9]{32}$`)),
      { flag: 'wx', mode: 0o600 }
    );
    expect(tracker.lastContent()).toMatch(new RegExp(`^${process.pid}:[a-f0-9]{32}$`));
  });

  it('returns false when lock is held by a live daemon (state file matches PID)', () => {
    mockFs.existsSync.mockReturnValue(true);

    // wx fails — lock exists; readFileSync returns existing lock content
    // (PID:token from a prior process). The PID in the state file matches
    // the lock file's PID, so we treat the daemon as alive.
    mockFs.writeFileSync.mockImplementation(() => {
      throw new Error('EEXIST');
    });
    mockFs.readFileSync.mockImplementation((file: string) => {
      if (file.endsWith('daemon.lock')) return `${process.pid}:abc`;
      if (file.endsWith('daemon.json')) {
        return JSON.stringify({
          ...VALID_STATE,
          pid: process.pid,
        });
      }
      throw new Error('ENOENT');
    });

    expect(acquireLock('/project')).toBe(false);
  });

  it('acquires stale lock from dead process', () => {
    mockFs.existsSync.mockReturnValue(true);

    // First wx-write throws (lock exists), subsequent writes succeed and
    // record the content so verifyLockOwnership reads our token.
    let writeCallCount = 0;
    let lastWritten: string | undefined;
    mockFs.writeFileSync.mockImplementation((file: string, content: string) => {
      writeCallCount++;
      if (writeCallCount === 1) throw new Error('EEXIST');
      if (typeof content === 'string' && file.endsWith('daemon.lock')) {
        lastWritten = content;
      }
    });

    mockFs.readFileSync.mockImplementation((file: string) => {
      if (file.endsWith('daemon.lock')) {
        return lastWritten ?? '999999999:dead';
      }
      throw new Error('ENOENT'); // no state file → recovery path
    });

    // process.kill(pid, 0) throws (dead PID).
    const origKill = process.kill;
    const killMock = vi.fn().mockImplementation(() => {
      throw new Error('ESRCH');
    });
    process.kill = killMock as unknown as typeof process.kill;

    try {
      const result = acquireLock('/project');
      expect(killMock).toHaveBeenCalledWith(999999999, 0);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/project/.sweetlink/daemon.lock');
      expect(result).toBe(true);
    } finally {
      process.kill = origKill;
    }
  });

  it('returns false when lock file cannot be read', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {
      throw new Error('EEXIST');
    });
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    expect(acquireLock('/project')).toBe(false);
  });
});

describe('releaseLock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes the lock file', () => {
    releaseLock('/project');
    expect(mockFs.unlinkSync).toHaveBeenCalledWith('/project/.sweetlink/daemon.lock');
  });

  it('does not throw if lock file does not exist', () => {
    mockFs.unlinkSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => releaseLock('/project')).not.toThrow();
  });
});
