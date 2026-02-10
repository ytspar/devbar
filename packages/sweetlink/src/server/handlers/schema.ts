/**
 * Schema Handler
 *
 * Handles saving page schemas to the file system.
 */

import { saveMarkdownArtifact } from './saveMarkdown.js';

export interface SchemaSaveResult {
  schemaPath: string;
}

/**
 * Handle page schema save: saves structured data as markdown to the screenshots folder
 */
export async function handleSaveSchema(data: {
  schema: unknown;
  markdown: string;
  url: string;
  title: string;
  timestamp: number;
}): Promise<SchemaSaveResult> {
  // Schema includes extra raw JSON section after the main markdown
  const body = `${data.markdown || '_No structured data found on this page_'}

---

## Raw JSON

\`\`\`json
${JSON.stringify(data.schema, null, 2)}
\`\`\``;

  const schemaPath = await saveMarkdownArtifact({
    type: 'schema',
    markdown: body,
    url: data.url,
    title: data.title,
    timestamp: data.timestamp,
  });

  return { schemaPath };
}
