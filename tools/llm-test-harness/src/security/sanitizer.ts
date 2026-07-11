/**
 * Input sanitizer for LLM test code — two tiers.
 *
 * The harness executes test code via `eval()` inside a Puppeteer page (see
 * `runner.ts`). The real isolation boundary is therefore the page itself:
 * there is no Node.js surface, request interception blocks non-local network,
 * and `evaluateOnNewDocument` neuters the storage/navigation/clipboard APIs.
 * String-matching the source can never be authoritative — `window['ev'+'al']`
 * defeats any regex — so this file splits the old flat denylist into two
 * honestly-named tiers:
 *
 *   - HARD_BLOCK: code the runtime *cannot* safely allow because the harness's
 *     own execution path relies on it (dynamic code execution) or because the
 *     pattern is a sandbox escape (Node/system/prototype pollution). These
 *     reject the run outright.
 *   - ADVISORY: patterns that are suspicious but that legitimate tests can
 *     legitimately need (storage, navigation, `document.write`, `iframe`,
 *     `el.onclick =`, `parent.`). These emit warnings only; the runtime guards
 *     in `runner.ts` are the actual gate.
 */

// Maximum code length to prevent DoS
const MAX_CODE_LENGTH = 10000

// Patterns whose presence aborts the run. Kept minimal: only things the
// runtime guards cannot safely handle.
const HARD_BLOCK: RegExp[] = [
  // Dynamic code execution — the harness runs via eval, so we can neither
  // allow test code to call eval/Function nor neuter eval globally.
  /eval\s*\(/,
  /\bFunction\s*\(/,
  /new\s+Function\b/,
  /setTimeout\s*\(\s*['"`]/,
  /setInterval\s*\(\s*['"`]/,

  // Prototype pollution — bypasses every runtime guard by poisoning shared
  // prototypes; there is no safe runtime mitigation.
  /__proto__/,
  /constructor\s*\[\s*['"]?prototype/,
  /constructor\s*\.\s*prototype/,

  // Node.js / system escape — unambiguous Node-only identifiers with no
  // legitimate browser-test use. `process`/`global` themselves are NOT here:
  // in a plain browser page they're simply undefined (harmless ReferenceError),
  // and matching them in source causes false positives on comments/prose.
  // Those are demoted to ADVISORY below.
  /\bchild_process\b/,
  /require\s*\(\s*['"](?:fs|child_process|path)['"]\s*\)/,
]

// Patterns that are suspicious but legitimate tests may need. These never
// block; they only add warnings. The runtime guards in runner.ts enforce them.
const ADVISORY: RegExp[] = [
  // Network access (also blocked by request interception at runtime).
  /\bXMLHttpRequest\b/,
  /\bfetch\s*\(/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /navigator\.sendBeacon/,

  // Storage / cookie exfiltration (neutered at runtime via evaluateOnNewDocument).
  /document\.cookie/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,

  // Dangerous document mutation (overridden to throw at runtime).
  /document\.write/,
  /document\.writeln/,
  /document\.open\s*\(/,
  /document\.domain\s*=/,

  // Navigation / popup (blocked at runtime).
  /window\.open/,
  /window\.location\s*=/,
  /window\.location\.href\s*=/,
  /window\.location\.replace/,
  /window\.location\.assign/,

  // Script / markup injection vectors — common in jQuery-compat tests, so warn
  // only. The runtime DOM parses them harmlessly inside the sandbox.
  /<script\b/i,
  /javascript\s*:/i,
  /\biframe\b/i,
  /\bframeElement\b/,
  /\bcontentWindow\b/,
  /\bon\w+\s*=/i, // el.onclick = fn, or onclick= in markup

  // Sandbox-escape-adjacent references.
  /(?:^|[^\w.])parent\s*\./, // node.parentNode is fine; bare parent. isn't
  /(?:^|[^\w.])top\s*\./,
  /(?:^|[^\w.])opener\s*\./,

  // Clipboard.
  /execCommand\s*\(\s*['"]copy['"]\s*\)/,
  /navigator\.clipboard/,

  // Node-context globals — in a plain browser page these are just undefined,
  // so they indicate Node-thinking rather than a real escape vector. Warn
  // (don't block) because the substrings appear freely in comments/prose.
  /(?:^|[^\w.])process\s*\.\s*/,
  /(?:^|[^\w.])global\s*\.\s*/,
  /(?:^|[^\w.])globalThis\s*\.\s*/,
]

// Suspicious keywords that may indicate injection (warn only).
const SUSPICIOUS_KEYWORDS = ['password', 'secret', 'private_key', 'credential', 'bearer']

export interface SanitizationResult {
  safe: boolean
  code?: string
  error?: string
  violations: string[]
  warnings: string[]
}

/**
 * Sanitize LLM-provided code for safe execution.
 *
 * Returns `safe: false` only when a HARD_BLOCK pattern matches; ADVISORY
 * matches and suspicious keywords populate `warnings` but never block.
 */
export function sanitize(code: string): SanitizationResult {
  const violations: string[] = []
  const warnings: string[] = []

  // Check code length
  if (code.length > MAX_CODE_LENGTH) {
    return {
      safe: false,
      error: `Code length ${code.length} exceeds maximum of ${MAX_CODE_LENGTH}`,
      violations: [`Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`],
      warnings,
    }
  }

  // Hard blocks — reject the run.
  for (const pattern of HARD_BLOCK) {
    if (pattern.test(code)) {
      violations.push(`Forbidden pattern detected: ${patternSource(pattern)}`)
    }
  }

  // Advisory — warn only, never block. Runtime guards enforce these.
  for (const pattern of ADVISORY) {
    if (pattern.test(code)) {
      warnings.push(`Advisory: ${patternSource(pattern)} (enforced at runtime)`)
    }
  }

  // Suspicious keywords (warn only)
  const lowerCode = code.toLowerCase()
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (lowerCode.includes(keyword)) {
      warnings.push(`Suspicious keyword detected: ${keyword}`)
    }
  }

  // Prompt-injection markers — warn only.
  if (code.includes('system:') || code.includes('user:') || code.includes('assistant:')) {
    warnings.push('Possible prompt injection markers detected')
  }

  if (violations.length > 0) {
    return {
      safe: false,
      error: 'Security violations detected',
      violations,
      warnings,
    }
  }

  // Sanitize the code - remove potentially dangerous characters at boundaries
  let sanitized = code.trim()

  // Remove BOM and zero-width characters
  sanitized = sanitized.replace(/[\uFEFF\u200B-\u200D\u2060\u206F]/g, '')

  // Ensure code ends with semicolon for safety
  if (!sanitized.endsWith(';') && !sanitized.endsWith('}')) {
    sanitized += ';'
  }

  return {
    safe: true,
    code: sanitized,
    violations,
    warnings,
  }
}

/** Strip regex delimiters/flags for a human-readable pattern label. */
function patternSource(pattern: RegExp): string {
  return pattern.toString().replace(/^\/|\/[gimsuy]*$/g, '')
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
  `.trim()
}
