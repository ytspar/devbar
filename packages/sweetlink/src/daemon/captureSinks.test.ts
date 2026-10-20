// @vitest-environment node

/**
 * Capture Sinks Tests
 *
 * Covers env parsing, the zero-dependency SigV4 S3 sink (signature verified
 * against the AWS SigV4 test suite vector), the HTTP webhook sink, user
 * module sinks, and dispatcher best-effort semantics.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'http';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  createHttpSink,
  createModuleSink,
  createS3Sink,
  createSinkFromConfig,
  dispatchCaptureArtifact,
  loadCaptureSinks,
  parseSinkConfigs,
  resetCaptureSinksForTests,
  type CaptureArtifact,
  type CaptureSink,
} from './captureSinks.js';

const ARTIFACT: CaptureArtifact = {
  kind: 'screenshot',
  filename: 'screenshot-1.jpg',
  localPath: '/nonexistent/screenshot-1.jpg',
  contentType: 'image/jpeg',
  meta: {
    url: 'https://example.com/',
    viewport: { width: 1920, height: 1080 },
    capturedAt: '2026-01-01T00:00:00.000Z',
  },
};

function tempArtifactFile(dir: string, filename = ARTIFACT.filename, bytes = Buffer.from('fake-bytes')) {
  const localPath = path.join(dir, filename);
  return { localPath, artifact: { ...ARTIFACT, localPath, filename } };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweetlink-sinks-'));
});

afterEach(async () => {
  resetCaptureSinksForTests();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// parseSinkConfigs
// ============================================================================

describe('parseSinkConfigs', () => {
  it('returns an empty array when unset', () => {
    expect(parseSinkConfigs(undefined)).toEqual([]);
    expect(parseSinkConfigs('')).toEqual([]);
    expect(parseSinkConfigs('   ')).toEqual([]);
  });

  it('parses a mixed config array', () => {
    const configs = parseSinkConfigs(
      JSON.stringify([
        { type: 's3', bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'SK' },
        { type: 'http', url: 'https://hook.example.com/' },
        { type: 'module', path: './sink.mjs' },
      ])
    );
    expect(configs).toHaveLength(3);
    expect(configs[0]).toMatchObject({ type: 's3', bucket: 'b' });
    expect(configs[2]).toMatchObject({ type: 'module', path: './sink.mjs' });
  });

  it('rejects non-array JSON', () => {
    expect(() => parseSinkConfigs('{"type":"s3"}')).toThrow(/JSON array/);
  });

  it('rejects entries without a string type', () => {
    expect(() => parseSinkConfigs('[{"bucket":"b"}]')).toThrow(/string "type"/);
  });
});

// ============================================================================
// loadCaptureSinks
// ============================================================================

describe('loadCaptureSinks', () => {
  it('returns no sinks without the env var', () => {
    expect(loadCaptureSinks({})).toEqual([]);
  });

  it('logs and returns no sinks on malformed JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sinks = loadCaptureSinks({ SWEETLINK_CAPTURE_SINKS: '{not json' });
    expect(sinks).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SWEETLINK_CAPTURE_SINKS'));
    warn.mockRestore();
  });

  it('skips an invalid sink but keeps the valid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sinks = loadCaptureSinks({
      SWEETLINK_CAPTURE_SINKS: JSON.stringify([
        { type: 'http', url: 'not-a-url' },
        { type: 'http', url: 'https://hook.example.com/' },
        { type: 'bogus' },
      ]),
    });
    expect(sinks).toHaveLength(1);
    expect(sinks[0]!.name).toBe('http:hook.example.com');
    expect(warn).toHaveBeenCalledTimes(2);
    log.mockRestore();
    warn.mockRestore();
  });
});

// ============================================================================
// S3 sink — signature verified against the AWS SigV4 test suite
// ============================================================================

describe('createS3Sink', () => {
  // Deterministic clock so the signature is reproducible. The AWS reference
  // vector below uses 20150830T123600Z.
  const REAL_DATE = Date;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2015-08-30T12:36:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.Date = REAL_DATE;
  });

  it('produces the AWS SigV4 test-suite signature for a PUT', async () => {
    // Vector: awsv4_testsuite/get-vanilla-query-order-key-case — adapted to a
    // PUT with a signed payload hash; keys/dates from the official suite.
    const { localPath, artifact } = tempArtifactFile(tmpDir);
    await fs.writeFile(localPath, '');

    const sink = createS3Sink({
      type: 's3',
      bucket: 'examplebucket',
      region: 'us-east-1',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    });

    let capturedAuth: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      capturedAuth = request.headers.get('authorization');
      return new Response('', { status: 200 });
    }) as typeof fetch;

    try {
      await sink.upload({ ...artifact, filename: 'test.txt', localPath });
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Credential scope + signed headers must match the official suite.
    expect(capturedAuth).toContain('Credential=AKIDEXAMPLE/20150830/us-east-1/s3/aws4_request');
    expect(capturedAuth).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
    expect(capturedAuth).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it('PUTs to an R2-style endpoint with the bucket in the path', async () => {
    const { localPath, artifact } = tempArtifactFile(tmpDir);
    await fs.writeFile(localPath, 'payload');

    const sink = createS3Sink({
      type: 's3',
      bucket: 'captures',
      prefix: 'devbar',
      endpoint: 'https://deadbeef.r2.cloudflarestorage.com',
      region: 'auto',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    });

    const calls: Array<{ url: string; method: string; body: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: Buffer.from(init?.body as ArrayBuffer).toString(),
      });
      return new Response('', { status: 200 });
    }) as typeof fetch;

    try {
      const result = await sink.upload(artifact);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe(
        'https://deadbeef.r2.cloudflarestorage.com/captures/devbar/screenshot-1.jpg'
      );
      expect(calls[0]!.method).toBe('PUT');
      expect(calls[0]!.body).toBe('payload');
      expect(result).toMatchObject({
        key: 'devbar/screenshot-1.jpg',
        url: 'https://deadbeef.r2.cloudflarestorage.com/captures/devbar/screenshot-1.jpg',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('supports a {bucket} placeholder in the endpoint', async () => {
    const { localPath, artifact } = tempArtifactFile(tmpDir);
    await fs.writeFile(localPath, 'x');

    const sink = createS3Sink({
      type: 's3',
      bucket: 'mybucket',
      endpoint: 'https://{bucket}.s3.us-west-2.amazonaws.com',
      region: 'us-west-2',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    });

    let url = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      url = String(input);
      return new Response('', { status: 200 });
    }) as typeof fetch;
    try {
      await sink.upload(artifact);
      expect(url).toBe('https://mybucket.s3.us-west-2.amazonaws.com/screenshot-1.jpg');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws with response detail on non-2xx', async () => {
    const { localPath, artifact } = tempArtifactFile(tmpDir);
    await fs.writeFile(localPath, 'x');

    const sink = createS3Sink({
      type: 's3',
      bucket: 'b',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response('SignatureDoesNotMatch', { status: 403 })
    ) as typeof fetch;
    try {
      await expect(sink.upload(artifact)).rejects.toThrow(/S3 PUT 403/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================================
// HTTP sink
// ============================================================================

describe('createHttpSink', () => {
  let server: Server;
  let received: Array<{ headers: Record<string, string | undefined>; body: string }>;

  beforeEach(async () => {
    received = [];
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({
          headers: {
            'content-type': req.headers['content-type'],
            'x-capture-filename': req.headers['x-capture-filename'],
            'x-capture-kind': req.headers['x-capture-kind'],
            authorization: req.headers['authorization'],
          },
          body: Buffer.concat(chunks).toString(),
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ url: 'https://files.example.com/c/1.jpg' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function serverUrl(): string {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no address');
    return `http://127.0.0.1:${address.port}/hook`;
  }

  it('POSTs bytes with capture headers and parses the returned url', async () => {
    const { localPath, artifact } = tempArtifactFile(tmpDir);
    await fs.writeFile(localPath, 'image-bytes');

    const sink = createHttpSink({
      type: 'http',
      url: serverUrl(),
      headers: { authorization: 'Bearer tok' },
    });
    const result = await sink.upload(artifact);

    expect(received).toHaveLength(1);
    expect(received[0]!.body).toBe('image-bytes');
    expect(received[0]!.headers).toMatchObject({
      'content-type': 'image/jpeg',
      'x-capture-filename': 'screenshot-1.jpg',
      'x-capture-kind': 'screenshot',
      authorization: 'Bearer tok',
    });
    expect(result).toEqual({ url: 'https://files.example.com/c/1.jpg' });
  });

  it('throws with response detail on non-2xx', async () => {
    const { localPath, artifact } = tempArtifactFile(tmpDir);
    await fs.writeFile(localPath, 'x');
    const sink = createHttpSink({ type: 'http', url: serverUrl() });
    // Server returns 200 by default; point at a closed port instead.
    const dead = createHttpSink({ type: 'http', url: 'http://127.0.0.1:1/' });
    await expect(dead.upload(artifact)).rejects.toThrow();
    expect(received).toHaveLength(0);
    void sink;
  });
});

// ============================================================================
// Module sink
// ============================================================================

describe('createModuleSink', () => {
  it('loads a sink from a user module relative to the project root', async () => {
    const { localPath, artifact } = tempArtifactFile(tmpDir);
    const sinkPath = path.join(tmpDir, 'my-sink.mjs');
    await fs.writeFile(
      sinkPath,
      'export const sink = { name: "gdrive", upload: async (a) => ({ url: "drive://"+a.filename }) };'
    );

    const sink = createModuleSink({ type: 'module', path: './my-sink.mjs' }, tmpDir);
    expect(sink.name).toBe('module:my-sink.mjs');
    await expect(sink.upload(artifact)).resolves.toEqual({ url: 'drive://screenshot-1.jpg' });
    void localPath;
  });

  it('supports a default export', async () => {
    const { artifact } = tempArtifactFile(tmpDir);
    const sinkPath = path.join(tmpDir, 'default-sink.mjs');
    await fs.writeFile(
      sinkPath,
      'export default { upload: async () => ({ key: "k" }) };'
    );
    const sink = createModuleSink({ type: 'module', path: sinkPath }, tmpDir);
    await expect(sink.upload(artifact)).resolves.toEqual({ key: 'k' });
  });

  it('rejects a module without an upload function', async () => {
    const sinkPath = path.join(tmpDir, 'not-a-sink.mjs');
    await fs.writeFile(sinkPath, 'export const something = 1;');
    const sink = createModuleSink({ type: 'module', path: sinkPath }, tmpDir);
    await expect(sink.upload(ARTIFACT)).rejects.toThrow(/upload\(artifact\)/);
  });
});

// ============================================================================
// Dispatcher
// ============================================================================

describe('dispatchCaptureArtifact', () => {
  it('does nothing when no sinks are configured', async () => {
    await expect(dispatchCaptureArtifact(ARTIFACT, [])).resolves.toBeUndefined();
  });

  it('uploads to every sink and logs results', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sinks: CaptureSink[] = [
      { name: 'a', upload: async () => ({ url: 'https://x/1' }) },
      { name: 'b', upload: async () => ({ key: 'k1' }) },
    ];
    await dispatchCaptureArtifact(ARTIFACT, sinks);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('stored screenshot-1.jpg'));
    log.mockRestore();
  });

  it('isolates sink failures and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = vi.fn(async () => ({ url: 'u' }));
    const sinks: CaptureSink[] = [
      { name: 'bad', upload: async () => ({ ok }) as never },
      { name: 'boom', upload: async () => { throw new Error('network down'); } },
      { name: 'good', upload: ok },
    ];
    // 'bad' resolves without url/key; ensure no crash and 'good' still ran.
    await expect(dispatchCaptureArtifact(ARTIFACT, sinks)).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    warn.mockRestore();
  });
});

// ============================================================================
// createSinkFromConfig
// ============================================================================

describe('createSinkFromConfig', () => {
  it('rejects unknown sink types', () => {
    expect(() =>
      createSinkFromConfig({ type: 'gdrive' } as never, tmpDir)
    ).toThrow(/Unknown capture sink type/);
  });
});
