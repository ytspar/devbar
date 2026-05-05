/**
 * handleGetLogs Tests
 *
 * Filter semantics matter for agents: a wrong filter would either return
 * an empty list (the agent thinks the page is silent when it isn't) or
 * leak unrelated logs.
 *
 * Verified contract:
 *  - When no filter is set, all logs are returned and totalCount === filteredCount.
 *  - When `filter` matches a level, ONLY logs with that level pass through.
 *  - When `filter` doesn't match a level, it falls back to a substring
 *    match against `message` (case-insensitive).
 *  - The filter never mutates the original array (a regression we'd see
 *    if someone changes `[...consoleLogs].filter` to `.filter` on the
 *    bare reference).
 */

import { describe, expect, it } from 'vitest';
import { handleGetLogs } from './logs.js';
import type { ConsoleLog, GetLogsCommand } from '../../types.js';

function makeLog(level: ConsoleLog['level'], message: string, ts = 0): ConsoleLog {
  return { level, message, timestamp: ts };
}

describe('handleGetLogs', () => {
  it('returns all logs when no filter is provided', () => {
    const logs: ConsoleLog[] = [
      makeLog('error', 'boom'),
      makeLog('warn', 'careful'),
      makeLog('log', 'fyi'),
    ];
    const cmd: GetLogsCommand = { type: 'get-logs' };
    const result = handleGetLogs(cmd, logs);
    expect(result.success).toBe(true);
    expect((result.data as { logs: ConsoleLog[] }).logs).toHaveLength(3);
    expect((result.data as { totalCount: number; filteredCount: number }).totalCount).toBe(3);
    expect((result.data as { totalCount: number; filteredCount: number }).filteredCount).toBe(3);
  });

  it('filters by level (exact match, case-insensitive)', () => {
    const logs: ConsoleLog[] = [
      makeLog('error', 'one'),
      makeLog('warn', 'two'),
      makeLog('error', 'three'),
    ];
    const result = handleGetLogs({ type: 'get-logs', filter: 'ERROR' }, logs);
    const data = result.data as { logs: ConsoleLog[]; filteredCount: number };
    expect(data.logs).toHaveLength(2);
    expect(data.logs.every((l) => l.level === 'error')).toBe(true);
    expect(data.filteredCount).toBe(2);
  });

  it('falls back to substring match against message when filter is not a level', () => {
    const logs: ConsoleLog[] = [
      makeLog('log', 'connection refused'),
      makeLog('error', 'CONNECTION TIMEOUT'),
      makeLog('warn', 'all good'),
    ];
    const result = handleGetLogs({ type: 'get-logs', filter: 'connection' }, logs);
    const data = result.data as { logs: ConsoleLog[] };
    expect(data.logs).toHaveLength(2);
    expect(data.logs.map((l) => l.message)).toEqual([
      'connection refused',
      'CONNECTION TIMEOUT',
    ]);
  });

  it('returns an empty result when the filter matches nothing (totalCount preserved)', () => {
    const logs: ConsoleLog[] = [makeLog('log', 'hello')];
    const result = handleGetLogs({ type: 'get-logs', filter: 'xyznotfound' }, logs);
    const data = result.data as { logs: ConsoleLog[]; totalCount: number; filteredCount: number };
    expect(data.logs).toHaveLength(0);
    expect(data.totalCount).toBe(1);
    expect(data.filteredCount).toBe(0);
  });

  it('does not mutate the input array', () => {
    const logs: ConsoleLog[] = [makeLog('error', 'a'), makeLog('warn', 'b')];
    const snapshot = [...logs];
    handleGetLogs({ type: 'get-logs', filter: 'error' }, logs);
    expect(logs).toEqual(snapshot);
  });

  it('attaches a timestamp on the response', () => {
    const before = Date.now();
    const result = handleGetLogs({ type: 'get-logs' }, []);
    const after = Date.now();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });
});
