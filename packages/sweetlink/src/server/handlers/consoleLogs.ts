/**
 * Console Logs Handler
 *
 * Handles saving console logs to the file system.
 */

import { saveMarkdownArtifact } from './saveMarkdown.js';

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
  const consoleLogsPath = await saveMarkdownArtifact({
    type: 'console-logs',
    markdown: data.markdown || '_No console logs recorded_',
    url: data.url,
    title: data.title,
    timestamp: data.timestamp,
  });

  return { consoleLogsPath };
}
