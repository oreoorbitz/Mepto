/**
 * Input sanitizer for LLM test code
 * Prevents prompt injection and malicious code execution
 */

import { ALLOWED_GLOBALS, ALLOWED_MEPTO_METHODS, ALLOWED_DOM_METHODS } from './whitelist';

// Maximum code length to prevent DoS
const MAX_CODE_LENGTH = 10000;

// Forbidden patterns that indicate injection attempts
const FORBIDDEN_PATTERNS = [
  // System command execution
  /child_process/,
  /require\s*\(\s*['"]child_process['"]\s*\)/,
  /(?<!\.)exec\s*\(/,
  /(?<!\.)spawn\s*\(/,
  /(?<!\.)fork\s*\(/,
  /execSync\s*\(/,
  /execFile\s*\(/,

  // Network access
  /XMLHttpRequest.*open\s*\(/,
  /fetch\s*\(\s*['"`]/,
  /WebSocket\s*\(/,
  /EventSource\s*\(/,

  // Data exfiltration
  /navigator\.sendBeacon/,
  /document\.cookie/,
  /localStorage\./,
  /sessionStorage\./,
  /indexedDB/,

  // Dangerous global access
  /process\s*\.\s*/,
  /global\s*\.\s*/,
  /globalThis\s*\.\s*/,

  // Script injection
  /<script\b/i,
  /javascript\s*:/i,
  /on\w+\s*=/i, // onclick=, onerror=, etc.

  // File system access (Node.js)
  /fs\s*\.\s*/,
  /path\s*\.\s*/,
  /require\s*\(\s*['"]fs['"]\s*\)/,

  // Dynamic code execution
  /eval\s*\(/,
  /Function\s*\(/,
  /new\s+Function\s*\(/,
  /setTimeout\s*\(\s*['"`]/,
  /setInterval\s*\(\s*['"`]/,

  // Prototype pollution
  /__proto__/,
  /constructor\s*\.\s*prototype/,

  // Dangerous document operations
  /document\.write/,
  /document\.writeln/,
  /document\.open\s*\(/,
  /document\.domain\s*=/,

  // Window manipulation
  /window\.open/,
  /window\.location\s*=/,
  /window\.location\.href\s*=/,
  /window\.location\.replace/,
  /window\.location\.assign/,

  // Form action manipulation
  /form\.action\s*=/,
  /action\s*=\s*['"`][^'"`]*javascript:/i,

  // CSS expression (IE legacy)
  /expression\s*\(/i,

  // iframe manipulation
  /iframe/,
  /frameElement/,

  // Sandbox escape attempts
  /contentWindow/,
  /parent\./,
  /top\./,
  /opener\./,

  // Clipboard access (potential data theft)
  /execCommand\s*\(\s*['"]copy['"]\s*\)/,
  /navigator\.clipboard/,
];

// Suspicious keywords that may indicate injection
const SUSPICIOUS_KEYWORDS = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'private_key',
  'credential',
  'auth',
  'authorization',
  'bearer',
];

export interface SanitizationResult {
  safe: boolean;
  code?: string;
  error?: string;
  violations: string[];
  warnings: string[];
}

/**
 * Sanitize LLM-provided code for safe execution
 */
export function sanitize(code: string): SanitizationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  // Check code length
  if (code.length > MAX_CODE_LENGTH) {
    violations.push(`Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`);
    return {
      safe: false,
      error: `Code length ${code.length} exceeds maximum of ${MAX_CODE_LENGTH}`,
      violations,
      warnings,
    };
  }

  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      const patternStr = pattern.toString().slice(1, -2);
      violations.push(`Forbidden pattern detected: ${patternStr}`);
    }
  }

  // Check for suspicious keywords (warn but don't block)
  const lowerCode = code.toLowerCase();
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (lowerCode.includes(keyword)) {
      warnings.push(`Suspicious keyword detected: ${keyword}`);
    }
  }

  // Check for potential prompt injection markers
  if (code.includes('system:') || code.includes('user:') || code.includes('assistant:')) {
    warnings.push('Possible prompt injection markers detected');
  }

  // Check for comment-based injection
  if (/\/\*.*\*\//s.test(code) && code.match(/\/\*[\s\S]*?(system|user|assistant)[\s\S]*?\*\//i)) {
    warnings.push('Suspicious comments detected');
  }

  if (violations.length > 0) {
    return {
      safe: false,
      error: 'Security violations detected',
      violations,
      warnings,
    };
  }

  // Sanitize the code - remove potentially dangerous characters at boundaries
  let sanitized = code.trim();

  // Remove BOM and zero-width characters
  sanitized = sanitized.replace(/[\uFEFF\u200B-\u200D\u2060\u206F]/g, '');

  // Ensure code ends with semicolon for safety
  if (!sanitized.endsWith(';') && !sanitized.endsWith('}')) {
    sanitized += ';';
  }

  return {
    safe: true,
    code: sanitized,
    violations,
    warnings,
  };
}

/**
 * Wrap code in a safe execution context
 */
export function wrapInContext(code: string): string {
  return `
(function() {
  'use strict';
  try {
    ${code}
  } catch (e) {
    return { error: e.message, stack: e.stack };
  }
})();
  `.trim();
}

/**
 * Validate that code only uses allowed identifiers
 */
export function validateIdentifiers(code: string): string[] {
  const violations: string[] = [];

  // Extract all identifiers from the code
  const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
  const matches = code.match(identifierRegex) || [];

  const allAllowed = new Set([
    ...ALLOWED_GLOBALS,
    ...ALLOWED_MEPTO_METHODS,
    ...ALLOWED_DOM_METHODS,
    // Common variable names
    'e', 'i', 'j', 'k', 'x', 'y', 'el', 'elem', 'element', 'item', 'val', 'key',
    'arr', 'array', 'obj', 'result', 'res', 'fn', 'cb', 'callback', 'data',
    'str', 'string', 'num', 'number', 'bool', 'len', 'length', 'idx', 'index',
    'ctx', 'context', 'self', 'that', 'this', 'args', 'arguments', 'params',
    'doc', 'document', 'win', 'window', 'body', 'head',
    'event', 'evt', 'ev', 'target', 'currentTarget', 'relatedTarget',
    'start', 'end', 'step', 'total', 'count', 'sum', 'max', 'min',
    'options', 'settings', 'config', 'props', 'attributes',
    'container', 'wrapper', 'parent', 'child', 'children', 'sibling',
    'input', 'output', 'value', 'name', 'id', 'class', 'tag', 'type',
    'default', 'case', 'switch', 'break', 'continue', 'return', 'if',
    'else', 'while', 'for', 'do', 'try', 'catch', 'finally', 'throw',
    'function', 'var', 'let', 'const', 'class', 'extends', 'super',
    'import', 'export', 'from', 'as', 'new', 'delete', 'typeof',
    'instanceof', 'in', 'of', 'void', 'yield', 'await', 'async',
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  ]);

  const seen = new Set<string>();
  for (const identifier of matches) {
    if (!seen.has(identifier) && !allAllowed.has(identifier)) {
      seen.add(identifier);
      // Don't flag if it's a property access (e.g., obj.property)
      if (!code.includes(identifier + '.') && !code.includes('.' + identifier)) {
        violations.push(`Unrecognized identifier: ${identifier}`);
      }
    }
  }

  return violations;
}
