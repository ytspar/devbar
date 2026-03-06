import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callClaude, CLAUDE_MAX_TOKENS, CLAUDE_MODEL, CLAUDE_PRICING } from './anthropic.js';

describe('CLAUDE_MODEL', () => {
  it('is a valid Claude model ID', () => {
    expect(CLAUDE_MODEL).toMatch(/^claude-/);
  });
});

describe('CLAUDE_MAX_TOKENS', () => {
  it('has a reasonable value', () => {
    expect(CLAUDE_MAX_TOKENS).toBeGreaterThan(0);
    expect(CLAUDE_MAX_TOKENS).toBeLessThanOrEqual(4096);
  });
});

describe('CLAUDE_PRICING', () => {
  it('has input and output prices', () => {
    expect(CLAUDE_PRICING.input).toBeDefined();
    expect(CLAUDE_PRICING.output).toBeDefined();
  });

  it('has positive prices', () => {
    expect(CLAUDE_PRICING.input).toBeGreaterThan(0);
    expect(CLAUDE_PRICING.output).toBeGreaterThan(0);
  });

  it('output is more expensive than input', () => {
    expect(CLAUDE_PRICING.output).toBeGreaterThan(CLAUDE_PRICING.input);
  });
});

describe('callClaude', () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  const mockPayload = {
    model: 'claude-sonnet-4-5-latest',
    max_tokens: 1024,
    messages: [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Hello' }],
      },
    ],
  };

  const mockResponse = {
    id: 'msg_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello back' }],
    model: 'claude-sonnet-4-5-latest',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 },
  };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key-123';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callClaude(mockPayload)).rejects.toThrow(
      'ANTHROPIC_API_KEY environment variable is not set'
    );
  });

  it('sends correct headers and body to the API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await callClaude(mockPayload);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-api-key-123',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(mockPayload),
      })
    );
  });

  it('returns parsed response on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await callClaude(mockPayload);
    expect(result).toEqual(mockResponse);
    expect(result.id).toBe('msg_123');
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(20);
  });

  it('throws on non-OK response with status and body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('{"error":{"message":"rate limited"}}'),
    });

    await expect(callClaude(mockPayload)).rejects.toThrow(
      'Anthropic API error (429): {"error":{"message":"rate limited"}}'
    );
  });

  it('throws on 401 unauthorized', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":{"message":"invalid api key"}}'),
    });

    await expect(callClaude(mockPayload)).rejects.toThrow('Anthropic API error (401)');
  });

  it('throws on 500 server error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await expect(callClaude(mockPayload)).rejects.toThrow('Anthropic API error (500)');
  });

  it('handles image content blocks in payload', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const imagePayload = {
      model: 'claude-sonnet-4-5-latest',
      max_tokens: 1024,
      messages: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/png', data: 'abc123' },
            },
            { type: 'text' as const, text: 'What is this?' },
          ],
        },
      ],
    };

    const result = await callClaude(imagePayload);
    expect(result).toEqual(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(imagePayload),
      })
    );
  });

  it('propagates network errors from fetch', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await expect(callClaude(mockPayload)).rejects.toThrow('Network error');
  });
});
