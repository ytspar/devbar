/**
 * Optional Capture Sinks
 *
 * Fan capture artifacts (screenshots, metadata, logs, a11y reports) out to
 * remote storage in addition to the local disk save. Sinks are best-effort:
 * a failing sink logs and never blocks or fails the local save or the
 * browser response.
 *
 * Configuration: SWEETLINK_CAPTURE_SINKS — a JSON array of sink configs:
 *
 *   [{"type":"s3","bucket":"captures","prefix":"devbar",
 *     "endpoint":"https://<account>.r2.cloudflarestorage.com","region":"auto",
 *     "accessKeyId":"...","secretAccessKey":"..."},
 *    {"type":"http","url":"https://example.com/hook","headers":{"authorization":"Bearer ..."}},
 *    {"type":"module","path":"./my-sink.mjs"}]
 *
 * Built-in types:
 *   s3     — any S3-compatible service (AWS S3, Cloudflare R2, MinIO, …) via a
 *            zero-dependency SigV4 PUT; set `endpoint` for R2/MinIO/Spaces
 *   http   — POST the raw bytes to a webhook URL (generic receivers, Google
 *            Apps Script → Drive, the Factory drain host, …)
 *   module — dynamic import() of a user module exporting `sink` (or default)
 *
 * Extending: a module sink receives every CaptureArtifact and can upload
 * anywhere (Google Drive, Dropbox, an internal CDN, …).
 */

import { createHash, createHmac } from 'crypto';
import { promises as fs } from 'fs';
import { pathToFileURL } from 'url';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type CaptureArtifactKind = 'screenshot' | 'metadata' | 'logs' | 'a11y';

export interface CaptureArtifact {
  kind: CaptureArtifactKind;
  filename: string;
  /** Absolute path of the already-saved local file. */
  localPath: string;
  contentType: string;
  meta: {
    url: string;
    viewport: { width: number; height: number };
    capturedAt: string;
  };
}

export interface CaptureSinkUploadResult {
  /** Public/permanent URL of the uploaded object, when the sink knows one. */
  url?: string;
  /** Provider object key, when the sink knows one. */
  key?: string;
}

export interface CaptureSink {
  readonly name: string;
  upload(artifact: CaptureArtifact): Promise<CaptureSinkUploadResult | void>;
}

export type CaptureSinkConfig =
  | {
      type: 's3';
      name?: string;
      bucket: string;
      prefix?: string;
      /** e.g. https://<account>.r2.cloudflarestorage.com (R2) or a MinIO origin. */
      endpoint?: string;
      /** AWS region; 'auto' for R2. Defaults to 'us-east-1'. */
      region?: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  | {
      type: 'http';
      name?: string;
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: 'module';
      name?: string;
      /** Absolute path, or relative to the sweetlink project root. */
      path: string;
    };

// ============================================================================
// Environment loading
// ============================================================================

const SINKS_ENV_VAR = 'SWEETLINK_CAPTURE_SINKS';

/**
 * Parse sink configs from the SWEETLINK_CAPTURE_SINKS JSON env var.
 * Returns an empty array when unset; throws on malformed JSON.
 */
export function parseSinkConfigs(raw: string | undefined): CaptureSinkConfig[] {
  if (!raw || raw.trim() === '') return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${SINKS_ENV_VAR} must be a JSON array of sink configs`);
  }
  for (const [index, entry] of parsed.entries()) {
    if (typeof entry !== 'object' || entry === null || typeof (entry as { type?: unknown }).type !== 'string') {
      throw new Error(`${SINKS_ENV_VAR}[${index}] must be an object with a string "type"`);
    }
  }
  return parsed as CaptureSinkConfig[];
}

// ============================================================================
// S3-compatible sink (zero-dependency SigV4 PUT)
// ============================================================================

const S3_DEFAULT_REGION = 'us-east-1';

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** amzdate: 20260101T000000Z, dateStamp: 20260101 */
function formatAmzDate(now: Date): { amzdate: string; dateStamp: string } {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const dateStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const amzdate = `${dateStamp}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  return { amzdate, dateStamp };
}

function resolveS3Url(endpoint: string | undefined, bucket: string, key: string, region: string): string {
  const cleanKey = key.split('/').map(encodeURIComponent).join('/');
  if (endpoint) {
    if (endpoint.includes('{bucket}')) {
      return `${endpoint.replace('{bucket}', bucket).replace(/\/+$/, '')}/${cleanKey}`;
    }
    return `${endpoint.replace(/\/+$/, '')}/${bucket}/${cleanKey}`;
  }
  if (region === S3_DEFAULT_REGION) {
    return `https://s3.amazonaws.com/${bucket}/${cleanKey}`;
  }
  return `https://s3.${region}.amazonaws.com/${bucket}/${cleanKey}`;
}

export function createS3Sink(config: Extract<CaptureSinkConfig, { type: 's3' }>): CaptureSink {
  const region = config.region ?? S3_DEFAULT_REGION;
  const prefix = config.prefix ? `${config.prefix.replace(/^\/+|\/+$/g, '')}/` : '';
  const name = config.name ?? `s3:${config.bucket}`;

  return {
    name,
    async upload(artifact) {
      const body = await fs.readFile(artifact.localPath);
      const key = `${prefix}${artifact.filename}`;
      const url = new URL(resolveS3Url(config.endpoint, config.bucket, key, region));
      const { amzdate, dateStamp } = formatAmzDate(new Date());
      const payloadHash = sha256Hex(body);

      const canonicalHeaders =
        `host:${url.host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzdate}\n`;
      const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
      const canonicalRequest = [
        'PUT',
        url.pathname,
        url.search.replace(/^\?/, ''),
        canonicalHeaders,
        signedHeaders,
        payloadHash,
      ].join('\n');

      const scope = `${dateStamp}/${region}/s3/aws4_request`;
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzdate,
        scope,
        sha256Hex(canonicalRequest),
      ].join('\n');

      const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
      const kRegion = hmac(kDate, region);
      const kService = hmac(kRegion, 's3');
      const kSigning = hmac(kService, 'aws4_request');
      const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

      const authorization =
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          authorization,
          'x-amz-date': amzdate,
          'x-amz-content-sha256': payloadHash,
          'content-type': artifact.contentType,
        },
        body,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`S3 PUT ${response.status}: ${detail}`);
      }
      return { url: url.toString(), key };
    },
  };
}

// ============================================================================
// HTTP webhook sink
// ============================================================================

export function createHttpSink(config: Extract<CaptureSinkConfig, { type: 'http' }>): CaptureSink {
  const name = config.name ?? `http:${new URL(config.url).host}`;
  return {
    name,
    async upload(artifact) {
      const body = await fs.readFile(artifact.localPath);
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'content-type': artifact.contentType,
          'x-capture-filename': artifact.filename,
          'x-capture-kind': artifact.kind,
          ...config.headers,
        },
        body,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }
      // Receivers may return {"url": "..."} or a Location header.
      let url: string | undefined;
      const location = response.headers.get('location');
      if (location) {
        url = location;
      } else {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const parsed = (await response.json()) as { url?: unknown };
          if (typeof parsed.url === 'string') url = parsed.url;
        }
      }
      return url ? { url } : undefined;
    },
  };
}

// ============================================================================
// User module sink
// ============================================================================

export function createModuleSink(
  config: Extract<CaptureSinkConfig, { type: 'module' }>,
  projectRoot: string
): CaptureSink {
  const resolved = path.isAbsolute(config.path) ? config.path : path.join(projectRoot, config.path);
  const name = config.name ?? `module:${path.basename(resolved)}`;
  let loaded: Promise<CaptureSink> | null = null;

  const load = async (): Promise<CaptureSink> => {
    const mod = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
    const candidate = (mod.sink ?? mod.default) as CaptureSink | undefined;
    if (!candidate || typeof candidate.upload !== 'function') {
      throw new Error(
        `Sink module ${resolved} must export a "sink" (or default) with an upload(artifact) method`
      );
    }
    return { name: candidate.name || name, upload: candidate.upload.bind(candidate) };
  };

  return {
    name,
    async upload(artifact) {
      loaded ??= load();
      return (await loaded).upload(artifact);
    },
  };
}

// ============================================================================
// Loader + dispatcher
// ============================================================================

export function createSinkFromConfig(
  config: CaptureSinkConfig,
  projectRoot: string
): CaptureSink {
  switch (config.type) {
    case 's3':
      return createS3Sink(config);
    case 'http':
      return createHttpSink(config);
    case 'module':
      return createModuleSink(config, projectRoot);
    default: {
      const unknown = (config as { type?: string }).type;
      throw new Error(`Unknown capture sink type "${unknown}"`);
    }
  }
}

/**
 * Build sinks from an env map (defaults to process.env). Malformed configs
 * produce a logged warning and are skipped so one bad sink never disables
 * capture saving.
 */
export function loadCaptureSinks(
  env: NodeJS.ProcessEnv = process.env,
  projectRoot = process.cwd()
): CaptureSink[] {
  let configs: CaptureSinkConfig[];
  try {
    configs = parseSinkConfigs(env[SINKS_ENV_VAR]);
  } catch (error) {
    console.warn(
      `[Sweetlink] Ignoring ${SINKS_ENV_VAR}: ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
  const sinks: CaptureSink[] = [];
  for (const [index, config] of configs.entries()) {
    try {
      sinks.push(createSinkFromConfig(config, projectRoot));
    } catch (error) {
      console.warn(
        `[Sweetlink] Capture sink #${index} (${config.type}) disabled: ${error instanceof Error ? error.message : error}`
      );
    }
  }
  if (sinks.length > 0) {
    console.log(`[Sweetlink] Capture sinks active: ${sinks.map((s) => s.name).join(', ')}`);
  }
  return sinks;
}

let cachedSinks: CaptureSink[] | null = null;

/** Lazily load and cache sinks from the environment (once per daemon lifetime). */
export function getCaptureSinks(projectRoot?: string): CaptureSink[] {
  cachedSinks ??= loadCaptureSinks(process.env, projectRoot);
  return cachedSinks;
}

/** Test hook: drop the cached env-loaded sink list. */
export function resetCaptureSinksForTests(): void {
  cachedSinks = null;
}

/**
 * Fan an artifact out to every configured sink. Best-effort: each sink is
 * isolated, failures are logged, and the function never throws.
 */
export async function dispatchCaptureArtifact(
  artifact: CaptureArtifact,
  sinks: CaptureSink[] = getCaptureSinks()
): Promise<void> {
  if (sinks.length === 0) return;
  await Promise.all(
    sinks.map(async (sink) => {
      try {
        const result = await sink.upload(artifact);
        const where = result?.url ?? result?.key ?? sink.name;
        console.log(`[Sweetlink] Capture sink "${sink.name}" stored ${artifact.filename} -> ${where}`);
      } catch (error) {
        console.warn(
          `[Sweetlink] Capture sink "${sink.name}" failed for ${artifact.filename}: ` +
            (error instanceof Error ? error.message : error)
        );
      }
    })
  );
}
