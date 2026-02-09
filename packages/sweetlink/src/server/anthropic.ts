/**
 * Anthropic API Client
 *
 * Fetch-based Claude API client — no SDK dependency.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Default model — uses the latest Sonnet via alias */
export const CLAUDE_MODEL = process.env.SWEETLINK_CLAUDE_MODEL ?? 'claude-sonnet-4-5-latest';
export const CLAUDE_MAX_TOKENS = 2048;

/** Approximate pricing (per million tokens) — used for cost display only */
export const CLAUDE_PRICING = {
  input: 15,
  output: 75,
} as const;

/** A text block in a Claude API response */
export interface TextBlock {
  type: 'text';
  text: string;
}

/** Claude Messages API response shape */
interface MessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<TextBlock | { type: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Content block sent to the API */
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/**
 * Call the Claude Messages API using fetch.
 */
export async function callClaude(payload: {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }>;
}): Promise<MessageResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<MessageResponse>;
}
