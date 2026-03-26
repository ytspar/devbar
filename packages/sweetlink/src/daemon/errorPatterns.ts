/**
 * Server Error Detection
 *
 * Regex-based error pattern matching for 10+ languages.
 * Used to detect errors in dev server logs captured by the ring buffer.
 */

export interface DetectedError {
  language: string;
  pattern: string;
  line: string;
  lineNumber?: number;
}

interface ErrorPattern {
  language: string;
  name: string;
  regex: RegExp;
}

const PATTERNS: ErrorPattern[] = [
  // JavaScript / Node.js
  { language: 'JavaScript', name: 'Error', regex: /\bError:/ },
  { language: 'JavaScript', name: 'TypeError', regex: /\bTypeError:/ },
  { language: 'JavaScript', name: 'ReferenceError', regex: /\bReferenceError:/ },
  { language: 'JavaScript', name: 'SyntaxError', regex: /\bSyntaxError:/ },
  { language: 'JavaScript', name: 'ERR!', regex: /ERR!/ },
  { language: 'JavaScript', name: 'UnhandledPromiseRejection', regex: /UnhandledPromiseRejection/ },
  { language: 'JavaScript', name: 'EACCES', regex: /\bEACCES\b/ },
  { language: 'JavaScript', name: 'ENOENT', regex: /\bENOENT\b/ },
  { language: 'JavaScript', name: 'ECONNREFUSED', regex: /\bECONNREFUSED\b/ },

  // Python
  { language: 'Python', name: 'Traceback', regex: /Traceback \(most recent call last\)/ },
  { language: 'Python', name: 'ValueError', regex: /\bValueError:/ },
  { language: 'Python', name: 'KeyError', regex: /\bKeyError:/ },
  { language: 'Python', name: 'ImportError', regex: /\bImportError:/ },
  { language: 'Python', name: 'raise', regex: /\braise\s/ },

  // Ruby / Rails
  { language: 'Ruby', name: 'RuntimeError', regex: /\bRuntimeError\b/ },
  { language: 'Ruby', name: 'NoMethodError', regex: /\bNoMethodError\b/ },
  { language: 'Ruby', name: 'RoutingError', regex: /ActionController::RoutingError/ },
  { language: 'Ruby', name: 'Errno', regex: /\bErrno::/ },

  // Go
  { language: 'Go', name: 'panic', regex: /\bpanic:/ },
  { language: 'Go', name: 'fatal error', regex: /\bfatal error:/ },
  { language: 'Go', name: 'goroutine', regex: /\bgoroutine\s/ },

  // Java / Kotlin
  { language: 'Java', name: 'Exception in thread', regex: /Exception in thread/ },
  { language: 'Java', name: 'Caused by', regex: /Caused by:/ },
  { language: 'Java', name: 'stack frame', regex: /at .+\(.+\.java:\d+\)/ },

  // Rust
  { language: 'Rust', name: 'panicked', regex: /thread '.+' panicked/ },
  { language: 'Rust', name: 'compiler error', regex: /error\[E\d+\]/ },

  // PHP
  { language: 'PHP', name: 'Fatal error', regex: /\bFatal error:/ },
  { language: 'PHP', name: 'Parse error', regex: /\bParse error:/ },
  { language: 'PHP', name: 'Warning on line', regex: /Warning:.*on line/ },

  // C# / .NET
  { language: 'C#', name: 'Unhandled exception', regex: /Unhandled exception/ },
  { language: 'C#', name: 'System Exception', regex: /System\.\w+Exception/ },

  // Elixir
  { language: 'Elixir', name: 'EXIT', regex: /\*\* \(EXIT\)/ },
  { language: 'Elixir', name: 'Error', regex: /\*\* \(\w+Error\)/ },

  // Generic
  { language: 'Generic', name: 'FATAL', regex: /\bFATAL\b/ },
  { language: 'Generic', name: 'CRITICAL', regex: /\bCRITICAL\b/ },
  { language: 'Generic', name: 'Segmentation fault', regex: /Segmentation fault/ },
  { language: 'Generic', name: 'out of memory', regex: /out of memory/i },
  { language: 'Generic', name: 'HTTP 5xx', regex: /\b5\d\d\s/ },
];

/**
 * Detect server errors in log text across multiple languages.
 */
export function detectServerErrors(text: string): DetectedError[] {
  const lines = text.split('\n');
  const errors: DetectedError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        errors.push({
          language: pattern.language,
          pattern: pattern.name,
          line,
          lineNumber: i + 1,
        });
        break; // one match per line to avoid duplicates
      }
    }
  }

  return errors;
}
