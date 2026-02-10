/**
 * Outline Handler
 *
 * Handles saving document outlines to the file system.
 */

import { saveMarkdownArtifact } from './saveMarkdown.js';

export interface OutlineSaveResult {
  outlinePath: string;
}

/**
 * Handle document outline save: saves the outline as markdown to the screenshots folder
 */
export async function handleSaveOutline(data: {
  outline: unknown[];
  markdown: string;
  url: string;
  title: string;
  timestamp: number;
}): Promise<OutlineSaveResult> {
  const outlinePath = await saveMarkdownArtifact({
    type: 'outline',
    markdown: data.markdown || '_No headings found in this document_',
    url: data.url,
    title: data.title,
    timestamp: data.timestamp,
  });

  return { outlinePath };
}
