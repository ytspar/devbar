import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../GlobalDevBar.js', () => ({
  getGlobalDevBar: vi.fn(),
  GlobalDevBar: {
    registerControl: vi.fn(),
    unregisterControl: vi.fn(),
  },
}));

import { GlobalDevBar, getGlobalDevBar } from '../GlobalDevBar.js';
import { gitBranchPlugin } from './gitBranch.js';

const mockGetGlobalDevBar = getGlobalDevBar as ReturnType<typeof vi.fn>;
const mockRegisterControl = GlobalDevBar.registerControl as ReturnType<typeof vi.fn>;
const mockUnregisterControl = GlobalDevBar.unregisterControl as ReturnType<typeof vi.fn>;

describe('gitBranchPlugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetGlobalDevBar.mockReturnValue(null);
    mockRegisterControl.mockClear();
    mockUnregisterControl.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers control when git branch is available', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'feat/login' });

    const cleanup = gitBranchPlugin();

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'devbar-plugin-git-branch',
        label: expect.stringContaining('feat/login'),
        variant: 'info',
      })
    );

    cleanup();
  });

  it('does not register control when no instance exists', () => {
    mockGetGlobalDevBar.mockReturnValue(null);

    const cleanup = gitBranchPlugin();

    expect(mockRegisterControl).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not register control when branch is null', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: null });

    const cleanup = gitBranchPlugin();

    expect(mockRegisterControl).not.toHaveBeenCalled();

    cleanup();
  });

  it('picks up branch after polling when initially unavailable', () => {
    mockGetGlobalDevBar.mockReturnValue(null);

    const cleanup = gitBranchPlugin();
    expect(mockRegisterControl).not.toHaveBeenCalled();

    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'main' });
    vi.advanceTimersByTime(2000);

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        label: expect.stringContaining('main'),
      })
    );

    cleanup();
  });

  it('updates control when branch changes', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'main' });

    const cleanup = gitBranchPlugin();
    expect(mockRegisterControl).toHaveBeenCalledTimes(1);

    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'feat/new' });
    vi.advanceTimersByTime(2000);

    expect(mockRegisterControl).toHaveBeenCalledTimes(2);
    expect(mockRegisterControl).toHaveBeenLastCalledWith(
      expect.objectContaining({
        label: expect.stringContaining('feat/new'),
      })
    );

    cleanup();
  });

  it('does not re-register when branch is unchanged', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'main' });

    const cleanup = gitBranchPlugin();
    expect(mockRegisterControl).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(mockRegisterControl).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('unregisters control when branch disappears (disconnect)', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'main' });

    const cleanup = gitBranchPlugin();
    expect(mockRegisterControl).toHaveBeenCalledTimes(1);

    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: null });
    vi.advanceTimersByTime(2000);

    expect(mockUnregisterControl).toHaveBeenCalledWith('devbar-plugin-git-branch');

    cleanup();
  });

  it('cleanup stops polling and unregisters', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'main' });

    const cleanup = gitBranchPlugin();
    cleanup();

    expect(mockUnregisterControl).toHaveBeenCalledWith('devbar-plugin-git-branch');

    mockRegisterControl.mockClear();
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'new-branch' });
    vi.advanceTimersByTime(4000);

    expect(mockRegisterControl).not.toHaveBeenCalled();
  });

  it('uses custom prefix', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'main' });

    const cleanup = gitBranchPlugin({ prefix: 'branch:' });

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'branch: main',
      })
    );

    cleanup();
  });

  it('uses custom variant', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'main' });

    const cleanup = gitBranchPlugin({ variant: 'warning' });

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'warning',
      })
    );

    cleanup();
  });

  it('passes onClick callback with branch name', () => {
    mockGetGlobalDevBar.mockReturnValue({ serverGitBranch: 'feat/test' });
    const onClick = vi.fn();

    const cleanup = gitBranchPlugin({ onClick });

    const registeredControl = mockRegisterControl.mock.calls[0][0];
    expect(registeredControl.onClick).toBeDefined();
    registeredControl.onClick();

    expect(onClick).toHaveBeenCalledWith('feat/test');

    cleanup();
  });
});
