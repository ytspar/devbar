/**
 * Shared Markdown Artifact Saver
 *
 * Provides a common function for saving markdown artifacts (outlines, schemas,
 * console logs) to the file system with consistent frontmatter and directory handling.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { generateBaseFilename, generateSlugFromUrl, SCREENSHOT_DIR } from '../../urlUtils.js';
import { getProjectRoot } from '../index.js';

/**
 * Save a markdown artifact to the screenshots directory with frontmatter.
 *
 * Handles: mkdir, slug generation, frontmatter construction, file write, and logging.
 * Returns the absolute path of the saved file.
 */
export async function saveMarkdownArtifact(opts: {
  type: string;
  markdown: string;
  url: string;
  title: string;
  timestamp: number;
}): Promise<string> {
  const { type, markdown, url, title, timestamp } = opts;

  // Create directory if it doesn't exist (relative to project root captured at server start)
  const dir = join(getProjectRoot(), SCREENSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });

  // Generate a slug from URL path or title and create filename with shared utility
  const slug = generateSlugFromUrl(url, title);
  const baseFilename = generateBaseFilename(type, timestamp, slug);

  // Capitalize the type for the heading (e.g. 'outline' -> 'Outline', 'console-logs' -> 'Console Logs')
  const heading = type
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Default title fallback based on type
  const titleFallback = heading;

  // Build the markdown file with frontmatter
  const fullMarkdown = `---
title: ${title || titleFallback}
url: ${url}
timestamp: ${new Date(timestamp).toISOString()}
---

# ${heading}

> Page: ${title || url}
> Generated: ${new Date(timestamp).toLocaleString()}

${markdown}
`;

  // Save the markdown file
  const filePath = join(dir, `${baseFilename}.md`);
  await fs.writeFile(filePath, fullMarkdown, 'utf-8');
  console.log(`[Sweetlink] ${heading} saved: ${filePath}`);

  return filePath;
}
