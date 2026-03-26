/**
 * Demo Document Builder
 *
 * Builds a Markdown document incrementally as an agent works.
 * Each command appends a section. The result is a reproducible
 * tutorial/proof document with embedded command outputs and screenshots.
 */

import { execFileSync, execSync } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface DemoState {
  title: string;
  filePath: string;
  sections: DemoSection[];
  startedAt: string;
  url?: string;
  gitBranch?: string;
  gitCommit?: string;
}

export interface DemoSection {
  type: 'note' | 'exec' | 'screenshot' | 'snapshot';
  content: string;
  /** For exec: the command that was run */
  command?: string;
  /** For exec: the exit code */
  exitCode?: number;
  /** For screenshot: base64 PNG (not stored in state, written to file) */
  screenshotFile?: string;
  timestamp: string;
}

// ============================================================================
// Helpers
// ============================================================================

function detectGit(): { branch: string | null; commit: string | null } {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { branch: branch !== 'HEAD' ? branch : null, commit };
  } catch {
    return { branch: null, commit: null };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function screenshotCount(state: DemoState): number {
  return state.sections.filter((s) => s.type === 'screenshot').length;
}

// ============================================================================
// Public API
// ============================================================================

/** Initialize a new demo document */
export async function initDemo(
  title: string,
  outputDir: string,
  options?: { url?: string },
): Promise<DemoState> {
  await fs.mkdir(outputDir, { recursive: true });

  const git = detectGit();
  const state: DemoState = {
    title,
    filePath: path.join(outputDir, 'DEMO.md'),
    sections: [],
    startedAt: new Date().toISOString(),
    url: options?.url,
    gitBranch: git.branch ?? undefined,
    gitCommit: git.commit ?? undefined,
  };

  await writeDemo(state);
  return state;
}

/** Add a prose note section */
export function addNote(state: DemoState, text: string): DemoState {
  return {
    ...state,
    sections: [
      ...state.sections,
      {
        type: 'note',
        content: text,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Run a command, capture output, add as code block.
 *
 * Uses execSync with shell: true because demo commands may contain
 * pipes, redirects, and other shell features. The command string
 * originates from the agent (not user input), so shell injection
 * is not a concern here.
 */
export function addExec(state: DemoState, command: string, args: string[]): DemoState {
  const fullCommand = [command, ...args].join(' ');
  let output = '';
  let exitCode = 0;

  try {
    output = String(execSync(fullCommand, {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
  } catch (err: unknown) {
    const execError = err as { stdout?: string; stderr?: string; status?: number };
    output = (execError.stdout ?? '') + (execError.stderr ?? '');
    exitCode = execError.status ?? 1;
  }

  // Trim trailing newline for cleaner display
  output = output.replace(/\n$/, '');

  return {
    ...state,
    sections: [
      ...state.sections,
      {
        type: 'exec',
        content: output,
        command: fullCommand,
        exitCode,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** Take a screenshot via daemon and embed reference */
export async function addScreenshot(
  state: DemoState,
  screenshotBuffer: Buffer,
  caption?: string,
): Promise<DemoState> {
  const index = screenshotCount(state) + 1;
  const filename = `demo-screenshot-${index}.png`;
  const outputDir = path.dirname(state.filePath);
  const filePath = path.join(outputDir, filename);

  await fs.writeFile(filePath, screenshotBuffer);

  const captionText = caption ?? `Screenshot ${index}`;

  return {
    ...state,
    sections: [
      ...state.sections,
      {
        type: 'screenshot',
        content: captionText,
        screenshotFile: filename,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** Add a snapshot (accessibility tree) section */
export function addSnapshot(state: DemoState, snapshotText: string): DemoState {
  return {
    ...state,
    sections: [
      ...state.sections,
      {
        type: 'snapshot',
        content: snapshotText,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** Remove the last section */
export function popSection(state: DemoState): DemoState {
  return {
    ...state,
    sections: state.sections.slice(0, -1),
  };
}

/** Render the demo state as a Markdown string */
export function renderDemo(state: DemoState): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${state.title}`);
  lines.push('');

  // Metadata
  const metaParts = ['Generated by Sweetlink', formatDate(state.startedAt)];
  if (state.gitBranch) {
    const commit = state.gitCommit ? ` @ ${state.gitCommit}` : '';
    metaParts.push(`${state.gitBranch}${commit}`);
  }
  lines.push(`> ${metaParts.join(' \u00b7 ')}`);

  if (state.url) {
    lines.push('>');
    lines.push(`> ${state.url}`);
  }

  // Sections
  for (const section of state.sections) {
    lines.push('');

    switch (section.type) {
      case 'note':
        lines.push(section.content);
        break;

      case 'exec':
        lines.push('```bash');
        lines.push(`$ ${section.command}`);
        if (section.content) {
          lines.push(section.content);
        }
        lines.push('```');
        break;

      case 'screenshot':
        lines.push(`![${section.content}](${section.screenshotFile})`);
        break;

      case 'snapshot':
        lines.push('```');
        lines.push(section.content);
        lines.push('```');
        break;
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** Write the current state to the markdown file */
export async function writeDemo(state: DemoState): Promise<void> {
  const markdown = renderDemo(state);
  await fs.writeFile(state.filePath, markdown, 'utf-8');

  // Persist state for subsequent commands
  const stateFile = path.join(path.dirname(state.filePath), 'demo-state.json');
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Verify a demo by re-running all exec sections and comparing outputs.
 *
 * Uses execSync with shell: true to reproduce the original commands
 * which may contain pipes and shell features.
 */
export async function verifyDemo(state: DemoState): Promise<{
  passed: boolean;
  failures: Array<{ index: number; command: string; expected: string; actual: string }>;
}> {
  const failures: Array<{ index: number; command: string; expected: string; actual: string }> = [];

  for (let i = 0; i < state.sections.length; i++) {
    const section = state.sections[i]!;
    if (section.type !== 'exec' || !section.command) continue;

    let actual = '';
    try {
      actual = String(execSync(section.command, {
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }));
    } catch (err: unknown) {
      const execError = err as { stdout?: string; stderr?: string };
      actual = (execError.stdout ?? '') + (execError.stderr ?? '');
    }

    actual = actual.replace(/\n$/, '');

    if (actual !== section.content) {
      failures.push({
        index: i,
        command: section.command,
        expected: section.content,
        actual,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
