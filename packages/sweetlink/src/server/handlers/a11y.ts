/**
 * Accessibility Handler
 *
 * Handles saving accessibility audit reports to the file system.
 */

import { saveMarkdownArtifact } from './saveMarkdown.js';

export interface A11ySaveResult {
  a11yPath: string;
}

/**
 * Handle accessibility audit save: saves the report as markdown to the screenshots folder
 */
export async function handleSaveA11y(data: {
  markdown: string;
  url: string;
  title: string;
  timestamp: number;
}): Promise<A11ySaveResult> {
  const a11yPath = await saveMarkdownArtifact({
    type: 'a11y',
    markdown: data.markdown || '_No accessibility violations found_',
    url: data.url,
    title: data.title,
    timestamp: data.timestamp,
  });

  return { a11yPath };
}
