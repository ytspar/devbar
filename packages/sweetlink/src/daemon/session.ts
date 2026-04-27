/**
 * Session Manifest
 *
 * Machine-readable session description for viewer generation,
 * report generation, and PR evidence upload.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * The closed set of recorded action names. Producers (logAction call sites in
 * daemon/server.ts) and consumers (sessions diff in cli/sweetlink.ts, the
 * viewer, the manifest schema) all share this union so a typo in one place
 * is a compile error rather than a silent divergence.
 */
export type RecordedAction =
  | 'screenshot'
  | 'snapshot'
  | 'click'
  | 'fill'
  | 'press'
  | 'hover'
  | 'navigate';

export interface ActionEntry {
  /** Seconds since session start */
  timestamp: number;
  /** Command name (click, fill, snapshot, screenshot, etc.) */
  action: RecordedAction;
  /** Command arguments */
  args: string[];
  /** Duration of the action in ms */
  duration: number;
  /** Bounding box of the target element (if applicable) */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Screenshot filename taken at this action */
  screenshot?: string;
}

export interface SessionManifest {
  sessionId: string;
  /** Optional human-friendly label set via `record start --label "..."`. */
  label?: string;
  /** Target app URL that was recorded */
  url?: string;
  /** Git branch at time of recording */
  gitBranch?: string;
  /** Git commit SHA at time of recording */
  gitCommit?: string;
  startedAt: string;
  endedAt: string;
  /** Duration in seconds */
  duration: number;
  commands: ActionEntry[];
  screenshots: string[];
  video?: string;
  errors: {
    console: number;
    network: number;
    server: number;
  };
}
