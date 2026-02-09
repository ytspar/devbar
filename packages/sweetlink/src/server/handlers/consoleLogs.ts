/**
 * Console Logs Handler
 *
 * Handles saving console logs to the file system.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { generateBaseFilename, generateSlugFromUrl, SCREENSHOT_DIR } from '../../urlUtils.js';
import { getProjectRoot } from '../index.js';

export interface ConsoleLogsSaveResult {
  consoleLogsPath: string;
}

/**
 * Handle console logs save: saves the logs as markdown to the screenshots folder
 */
export async function handleSaveConsoleLogs(data: {
  logs: unknown[];
  markdown: string;
  url: string;
  title: string;
  timestamp: number;
}): Promise<ConsoleLogsSaveResult> {
  const { markdown, url, title, timestamp } = data;

  // Create directory if it doesn't exist (relative to project root captured at server start)
  const dir = join(getProjectRoot(), SCREENSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });

  // Generate a slug from URL path or title and create filename with shared utility
  const slug = generateSlugFromUrl(url, title);
  const baseFilename = generateBaseFilename('console-logs', timestamp, slug);

  // Build the console logs markdown file with frontmatter
  const logsMarkdown = `---
title: ${title || 'Console Logs'}
url: ${url}
timestamp: ${new Date(timestamp).toISOString()}
---

# Console Logs

> Page: ${title || url}
> Generated: ${new Date(timestamp).toLocaleString()}

${markdown || '_No console logs recorded_'}
`;

  // Save the console logs markdown
  const consoleLogsPath = join(dir, `${baseFilename}.md`);
  await fs.writeFile(consoleLogsPath, logsMarkdown, 'utf-8');
  console.log(`[Sweetlink] Console logs saved: ${consoleLogsPath}`);

  return { consoleLogsPath };
}
