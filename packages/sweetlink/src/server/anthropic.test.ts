import { describe, it, expect } from 'vitest';
import { CLAUDE_MODEL, CLAUDE_MAX_TOKENS, CLAUDE_PRICING } from './anthropic.js';

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
