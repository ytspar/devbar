/**
 * Session Manifest
 *
 * Machine-readable session description for viewer generation,
 * report generation, and PR evidence upload.
 */

// ============================================================================
// Types
// ============================================================================

export interface ActionEntry {
  /** Seconds since session start */
  timestamp: number;
  /** Command name (click, fill, snapshot, screenshot, etc.) */
  action: string;
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
