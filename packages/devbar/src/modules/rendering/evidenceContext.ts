/**
 * Helpers for adding LLM-readable provenance to DevBar evidence modals.
 */

import type { ModalEvidenceContext } from '../../ui/index.js';
import type { DevBarState } from '../types.js';

export function createModalEvidenceContext(
  state: DevBarState,
  title: string,
  options: {
    artifactPath?: string | null;
    observation?: string;
  } = {}
): ModalEvidenceContext {
  const url = typeof window !== 'undefined' ? window.location.href : 'unknown';
  const viewport =
    typeof window !== 'undefined'
      ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`
      : 'unknown';
  const screenshotPath = state.lastScreenshot ?? 'not captured yet';
  const artifactPath = options.artifactPath ?? 'not saved yet';
  const refsHint = `Run pnpm sweetlink inspect --url ${url} before acting to refresh @e refs.`;

  const lines = [
    `# ${title}`,
    `- URL: ${url}`,
    `- Viewport: ${viewport}`,
    `- Screenshot: ${screenshotPath}`,
    `- Artifact: ${artifactPath}`,
    `- Refs: ${refsHint}`,
  ];
  if (options.observation) lines.push(`- Observation: ${options.observation}`);

  return {
    title: 'Agent Context',
    items: [
      { label: 'URL', value: url },
      { label: 'Viewport', value: viewport },
      { label: 'Screenshot', value: screenshotPath },
      { label: 'Artifact', value: artifactPath },
      { label: 'Refs', value: refsHint },
    ],
    copyText: lines.join('\n'),
  };
}
