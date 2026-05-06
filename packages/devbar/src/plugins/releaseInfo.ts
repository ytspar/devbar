/**
 * Release Info Plugin for DevBar
 *
 * Displays release metadata in the devbar toolbar: a release timestamp, an
 * optional version number, and optional changelog text on hover.
 *
 * Usage:
 *   import { releaseInfoPlugin } from '@ytspar/devbar/plugins/release-info';
 *   const cleanup = releaseInfoPlugin({
 *     version: '1.4.2',
 *     releasedAt: '2026-05-06T06:21:23Z',
 *     changelog: ['Show staging release metadata in DevBar'],
 *   });
 *   // later: cleanup();
 */

import { GlobalDevBar } from '../GlobalDevBar.js';

const CONTROL_ID = 'devbar-plugin-release-info';

export interface ReleaseInfo {
  /** ISO string, epoch milliseconds, or Date for the release/build time. */
  releasedAt: string | number | Date;
  /** Optional app version displayed before the timestamp. */
  version?: string;
  /** Optional changelog lines rendered in the control tooltip. */
  changelog?: readonly string[];
}

export interface ReleaseInfoPluginOptions {
  /** Override the registered control id when multiple release badges are needed. */
  id?: string;
  /** Override the badge label entirely. */
  label?: string;
  /** Prefix used before the version. Default: "v". */
  versionPrefix?: string;
  /** Locale passed to Intl.DateTimeFormat. Defaults to the browser locale. */
  locale?: Intl.LocalesArgument;
  /** Time zone passed to Intl.DateTimeFormat. Defaults to the browser time zone. */
  timeZone?: string;
  /** Control variant for styling. */
  variant?: 'default' | 'info' | 'warning';
  /** Callback when the release badge is clicked. */
  onClick?: (release: ReleaseInfo) => void;
}

function parseReleaseDate(value: ReleaseInfo['releasedAt']): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringifyReleaseTime(value: ReleaseInfo['releasedAt']): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function formatReleaseTimestamp(
  releasedAt: ReleaseInfo['releasedAt'],
  options: Pick<ReleaseInfoPluginOptions, 'locale' | 'timeZone'> = {}
): string {
  const date = parseReleaseDate(releasedAt);
  if (!date) {
    return stringifyReleaseTime(releasedAt);
  }

  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: options.timeZone,
  }).format(date);
}

export function createReleaseInfoLabel(
  release: ReleaseInfo,
  options: Pick<ReleaseInfoPluginOptions, 'label' | 'locale' | 'timeZone' | 'versionPrefix'> = {}
): string {
  if (options.label) {
    return options.label;
  }

  const timestamp = formatReleaseTimestamp(release.releasedAt, options);
  if (!release.version) {
    return timestamp;
  }

  return `${options.versionPrefix ?? 'v'}${release.version} ${timestamp}`;
}

export function createReleaseInfoTooltip(
  release: ReleaseInfo,
  options: Pick<ReleaseInfoPluginOptions, 'locale' | 'timeZone' | 'versionPrefix'> = {}
): string {
  const lines = [
    release.version ? `Release ${options.versionPrefix ?? 'v'}${release.version}` : 'Release',
    `Released: ${formatReleaseTimestamp(release.releasedAt, options)}`,
  ];

  if (release.changelog && release.changelog.length > 0) {
    lines.push('', 'Changelog');
    for (const item of release.changelog) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join('\n');
}

/**
 * Activate the release info plugin.
 * @param release - Release metadata to display.
 * @param options - Optional configuration.
 * @returns A cleanup function that unregisters the control.
 */
export function releaseInfoPlugin(
  release: ReleaseInfo,
  options: ReleaseInfoPluginOptions = {}
): () => void {
  const controlId = options.id ?? CONTROL_ID;

  GlobalDevBar.registerControl({
    id: controlId,
    label: createReleaseInfoLabel(release, options),
    tooltip: () => createReleaseInfoTooltip(release, options),
    variant: options.variant ?? 'info',
    onClick: options.onClick ? () => options.onClick?.(release) : undefined,
  });

  return () => {
    GlobalDevBar.unregisterControl(controlId);
  };
}
