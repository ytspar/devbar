// @vitest-environment node

/**
 * Error Pattern Detection Tests
 *
 * Tests the regex-based server error detection across multiple languages.
 */

import { describe, expect, it } from 'vitest';
import { detectServerErrors } from './errorPatterns.js';

describe('detectServerErrors', () => {
  describe('JavaScript / Node.js errors', () => {
    it('detects Error:', () => {
      const result = detectServerErrors('Error: something went wrong');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('JavaScript');
      expect(result[0].pattern).toBe('Error');
      expect(result[0].line).toBe('Error: something went wrong');
    });

    it('detects TypeError:', () => {
      const result = detectServerErrors('TypeError: undefined is not a function');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('JavaScript');
      expect(result[0].pattern).toBe('TypeError');
    });

    it('detects ReferenceError:', () => {
      const result = detectServerErrors('ReferenceError: x is not defined');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('JavaScript');
      expect(result[0].pattern).toBe('ReferenceError');
    });

    it('detects SyntaxError:', () => {
      const result = detectServerErrors('SyntaxError: Unexpected token }');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('JavaScript');
      expect(result[0].pattern).toBe('SyntaxError');
    });

    it('detects ERR!', () => {
      const result = detectServerErrors('npm ERR! code ELIFECYCLE');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('ERR!');
    });

    it('detects UnhandledPromiseRejection', () => {
      const result = detectServerErrors('UnhandledPromiseRejection: something failed');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('UnhandledPromiseRejection');
    });

    it('detects EACCES', () => {
      const result = detectServerErrors('listen EACCES: permission denied');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('EACCES');
    });

    it('detects ENOENT', () => {
      const result = detectServerErrors('ENOENT: no such file or directory');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('ENOENT');
    });

    it('detects ECONNREFUSED', () => {
      const result = detectServerErrors('connect ECONNREFUSED 127.0.0.1:3000');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('ECONNREFUSED');
    });
  });

  describe('Python errors', () => {
    it('detects Traceback', () => {
      const result = detectServerErrors('Traceback (most recent call last)');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Python');
      expect(result[0].pattern).toBe('Traceback');
    });

    it('detects ValueError:', () => {
      const result = detectServerErrors('ValueError: invalid literal for int()');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Python');
      expect(result[0].pattern).toBe('ValueError');
    });

    it('detects KeyError:', () => {
      const result = detectServerErrors("KeyError: 'missing_key'");
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Python');
      expect(result[0].pattern).toBe('KeyError');
    });

    it('detects ImportError:', () => {
      const result = detectServerErrors('ImportError: No module named foo');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Python');
      expect(result[0].pattern).toBe('ImportError');
    });

    it('detects raise statement', () => {
      const result = detectServerErrors('    raise ValueError("bad value")');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Python');
      expect(result[0].pattern).toBe('raise');
    });
  });

  describe('Go errors', () => {
    it('detects panic:', () => {
      const result = detectServerErrors('panic: runtime error: index out of range');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Go');
      expect(result[0].pattern).toBe('panic');
    });

    it('detects fatal error:', () => {
      const result = detectServerErrors('fatal error: all goroutines are asleep');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Go');
      expect(result[0].pattern).toBe('fatal error');
    });

    it('detects goroutine', () => {
      const result = detectServerErrors('goroutine 1 [running]:');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Go');
      expect(result[0].pattern).toBe('goroutine');
    });
  });

  describe('Java errors', () => {
    it('detects Exception in thread', () => {
      const result = detectServerErrors(
        'Exception in thread "main" java.lang.NullPointerException'
      );
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Java');
      expect(result[0].pattern).toBe('Exception in thread');
    });

    it('detects Caused by:', () => {
      const result = detectServerErrors('Caused by: java.io.FileNotFoundException');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Java');
      expect(result[0].pattern).toBe('Caused by');
    });

    it('detects Java stack frame', () => {
      const result = detectServerErrors('	at com.example.Main.run(Main.java:42)');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Java');
      expect(result[0].pattern).toBe('stack frame');
    });
  });

  describe('Rust errors', () => {
    it('detects thread panicked', () => {
      const result = detectServerErrors("thread 'main' panicked at 'index out of bounds'");
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Rust');
      expect(result[0].pattern).toBe('panicked');
    });

    it('detects compiler error codes', () => {
      const result = detectServerErrors('error[E0308]: mismatched types');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Rust');
      expect(result[0].pattern).toBe('compiler error');
    });
  });

  describe('Ruby errors', () => {
    it('detects RuntimeError', () => {
      const result = detectServerErrors('RuntimeError: something failed');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Ruby');
      expect(result[0].pattern).toBe('RuntimeError');
    });

    it('detects NoMethodError', () => {
      const result = detectServerErrors("NoMethodError: undefined method 'foo'");
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Ruby');
      expect(result[0].pattern).toBe('NoMethodError');
    });

    it('detects RoutingError', () => {
      const result = detectServerErrors('ActionController::RoutingError (No route matches)');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Ruby');
      expect(result[0].pattern).toBe('RoutingError');
    });
  });

  describe('PHP errors', () => {
    it('detects Fatal error:', () => {
      const result = detectServerErrors('Fatal error: Allowed memory size exhausted');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('PHP');
      expect(result[0].pattern).toBe('Fatal error');
    });

    it('detects Parse error:', () => {
      const result = detectServerErrors('Parse error: syntax error, unexpected token');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('PHP');
      expect(result[0].pattern).toBe('Parse error');
    });
  });

  describe('C# / .NET errors', () => {
    it('detects Unhandled exception', () => {
      const result = detectServerErrors('Unhandled exception. System.NullReferenceException');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('C#');
      expect(result[0].pattern).toBe('Unhandled exception');
    });

    it('detects System exceptions', () => {
      const result = detectServerErrors('System.ArgumentException: invalid argument');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('C#');
      expect(result[0].pattern).toBe('System Exception');
    });
  });

  describe('Elixir errors', () => {
    it('detects EXIT', () => {
      const result = detectServerErrors('** (EXIT) :timeout');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Elixir');
      expect(result[0].pattern).toBe('EXIT');
    });

    it('detects Elixir Error', () => {
      const result = detectServerErrors('** (ArgumentError) argument error');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Elixir');
      expect(result[0].pattern).toBe('Error');
    });
  });

  describe('Generic errors', () => {
    it('detects FATAL', () => {
      const result = detectServerErrors('FATAL: database connection lost');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Generic');
      expect(result[0].pattern).toBe('FATAL');
    });

    it('detects CRITICAL', () => {
      const result = detectServerErrors('CRITICAL: disk space exhausted');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Generic');
      expect(result[0].pattern).toBe('CRITICAL');
    });

    it('detects Segmentation fault', () => {
      const result = detectServerErrors('Segmentation fault (core dumped)');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Generic');
      expect(result[0].pattern).toBe('Segmentation fault');
    });

    it('detects out of memory (case-insensitive)', () => {
      const result = detectServerErrors('Out Of Memory killer invoked');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('out of memory');
    });

    it('detects HTTP 500 status', () => {
      const result = detectServerErrors('HTTP/1.1 500 Internal Server Error');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('Generic');
      expect(result[0].pattern).toBe('HTTP 5xx');
    });

    it('detects HTTP 503 status', () => {
      const result = detectServerErrors('503 Service Unavailable');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('HTTP 5xx');
    });
  });

  describe('clean output', () => {
    it('returns empty array for clean output', () => {
      const result = detectServerErrors(
        'Server started on port 3000\nListening for connections...'
      );
      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(detectServerErrors('')).toEqual([]);
    });

    it('returns empty array for whitespace-only input', () => {
      expect(detectServerErrors('   \n   \n   ')).toEqual([]);
    });
  });

  describe('result fields', () => {
    it('returns correct language field', () => {
      const result = detectServerErrors('panic: something bad');
      expect(result[0].language).toBe('Go');
    });

    it('returns correct pattern field', () => {
      const result = detectServerErrors('panic: something bad');
      expect(result[0].pattern).toBe('panic');
    });

    it('returns the full line in the line field', () => {
      const input = '  panic: full line with whitespace  ';
      const result = detectServerErrors(input);
      expect(result[0].line).toBe(input);
    });

    it('returns correct 1-based lineNumber', () => {
      const result = detectServerErrors('line1\nline2\nError: on line 3');
      expect(result).toHaveLength(1);
      expect(result[0].lineNumber).toBe(3);
    });
  });

  describe('multi-line input', () => {
    it('detects multiple errors across different lines', () => {
      const input = [
        'Starting server...',
        'Error: connection failed',
        'Retrying...',
        'TypeError: cannot read property',
        'Server stopped',
      ].join('\n');

      const result = detectServerErrors(input);
      expect(result).toHaveLength(2);
      expect(result[0].pattern).toBe('Error');
      expect(result[0].lineNumber).toBe(2);
      expect(result[1].pattern).toBe('TypeError');
      expect(result[1].lineNumber).toBe(4);
    });

    it('only matches one pattern per line (first match wins)', () => {
      // "Error:" comes before "FATAL" in the pattern list
      const result = detectServerErrors('Error: FATAL problem occurred');
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('Error');
    });

    it('detects errors from multiple languages in the same output', () => {
      const input = [
        'Error: js problem',
        'Traceback (most recent call last)',
        'panic: go problem',
      ].join('\n');

      const result = detectServerErrors(input);
      expect(result).toHaveLength(3);
      expect(result[0].language).toBe('JavaScript');
      expect(result[1].language).toBe('Python');
      expect(result[2].language).toBe('Go');
    });
  });
});
