//     mepto hotkey — bitmask shortcut helper (key-bench §3.3.2, §6.2 playbook #4)
//     16.5M ops/s bitmask+Map<number> vs 5.38M normalized-string vs 2.28M linear scan.
//     Parse at registration, match at dispatch; guards are free (<0.5% Table 3-8).

import { type MeptoStatic } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  // Modifier bit positions — distinct from low-byte key codes (0–255).
  // Using 1<<10..13 (1024–8192) avoids 32-bit sign bit (1<<31) and stays
  // within SMI range in V8; same family as xterm 4-bit mask, expanded.
  const CTRL = 1 << 10 // 1024
  const ALT = 1 << 11 // 2048
  const SHIFT = 1 << 12 // 4096
  const META = 1 << 13 // 8192

  const namedKeyCodes: Record<string, number> = {
    backspace: 8,
    tab: 9,
    enter: 13,
    shift: 16,
    ctrl: 17,
    control: 17,
    alt: 18,
    capslock: 20,
    escape: 27,
    esc: 27,
    space: 32,
    ' ': 32,
    pageup: 33,
    pagedown: 34,
    end: 35,
    home: 36,
    arrowleft: 37,
    arrowup: 38,
    arrowright: 39,
    arrowdown: 40,
    left: 37,
    up: 38,
    right: 39,
    down: 40,
    insert: 45,
    delete: 46,
    meta: 91,
    cmd: 91,
    command: 91,
    f1: 112,
    f2: 113,
    f3: 114,
    f4: 115,
    f5: 116,
    f6: 117,
    f7: 118,
    f8: 119,
    f9: 120,
    f10: 121,
    f11: 122,
    f12: 123,
  }

  function keyToCode(key: string): number {
    if (!key) return 0
    const lower = key.toLowerCase()
    if (namedKeyCodes[lower] !== undefined) return namedKeyCodes[lower]
    // Single char: use upper char code (K => 75) — matches keyCode/which for A-Z/0-9
    if (key.length === 1) return key.toUpperCase().charCodeAt(0)
    // Fallback: hash of string lowercased char codes in low byte range is not useful;
    // return 0 so modifier-only encodings still work; caller should prefer explicit map.
    return 0
  }

  /** Encode a live KeyboardEvent to the same int that parse() produces. */
  function encode(e: KeyboardEvent): number {
    let mask = 0
    if (e.ctrlKey) mask |= CTRL
    if (e.altKey) mask |= ALT
    if (e.shiftKey) mask |= SHIFT
    if (e.metaKey) mask |= META
    // Prefer legacy keyCode/which which are still set on trusted events; fall back to key.
    const code =
      (e as unknown as { keyCode?: number }).keyCode ||
      (e as unknown as { which?: number }).which ||
      keyToCode(e.key || '')
    return mask | (code & 0xff)
  }

  /** Parse a binding string like "Ctrl+Shift+K" or "Meta+Enter" to the encoded int.
   *  Case-insensitive, '+' or '-' as separators, 'Mod' maps to Meta on Mac else Ctrl,
   *  'Cmd'/'Command' map to Meta. Returns stable int for Map<number> lookup.
   */
  function parse(binding: string): number {
    if (!binding || typeof binding !== 'string') return 0
    const parts = binding
      .split(/[+-]/)
      .map(s => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return 0
    let mask = 0
    let keyPart = ''
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].toLowerCase()
      if (p === 'ctrl' || p === 'control') mask |= CTRL
      else if (p === 'alt' || p === 'option') mask |= ALT
      else if (p === 'shift') mask |= SHIFT
      else if (p === 'meta' || p === 'cmd' || p === 'command' || p === 'win' || p === 'super')
        mask |= META
      else if (p === 'mod' || p === '$mod') mask |= isMac ? META : CTRL
      else {
        // First non-modifier token is the key; remainder (if any) is also key (e.g. ArrowLeft)
        keyPart = parts.slice(i).join('+')
        break
      }
    }
    // If key is "+" itself: split lost it — handle single-char bindings above already.
    if (!keyPart && parts.length === 1) keyPart = parts[0]
    // Normalize keyPart for lookup: remove remaining '+' separators, lower for map
    const normalized = keyPart.replace(/\+/g, '')
    const code = keyToCode(normalized) || keyToCode(keyPart)
    return mask | (code & 0xff)
  }

  /** One-line guard: should a keydown be ignored (IME/repeat/process)?
   *  Cheap (<0.5% Table 3-8) — hoist e.key reads; caller should early-return when true.
   */
  function shouldIgnore(e: KeyboardEvent): boolean {
    return !!(
      e.repeat ||
      e.isComposing ||
      e.keyCode === 229 ||
      e.key === 'Process' ||
      e.key === 'Dead'
    )
  }

  const hotkey = {
    CTRL,
    ALT,
    SHIFT,
    META,
    CMD: META,
    encode,
    parse,
    shouldIgnore,
    keyToCode,
  }

  ;($ as unknown as Record<string, unknown>).hotkey = hotkey
  // Also expose as $.key for terse alias (hotkeys-js style)
  ;($ as unknown as Record<string, unknown>).key = hotkey
  // Pure ESM exports for treeshakable apps (Shopify apps) — `import { hotkey } from 'meptos/hotkey'`
  // without needing the global side effect. Downstream bundler keeps only this file + core.
  ;(globalThis as unknown as Record<string, unknown>).__mepto_hotkey = hotkey
})(mepto as unknown as MeptoStatic)

// ESM pure re-export for `import { hotkey } from 'meptos/hotkey'` (no global required)
// This is evaluated after the IIFE side-effect above; apps that want a pure import can
// tree-shake to just the bitmask logic without the Mepto global.
// The file is still side-effectful (installs onto Mepto) but the named export is pure.
export const CTRL = 1 << 10
export const ALT = 1 << 11
export const SHIFT = 1 << 12
export const META = 1 << 13
export const CMD = META
// Re-export helpers as pure functions (same impl as above, redefined for ESM)
// Note: these are intentionally duplicated to avoid cross-IIFE closure — the IIFE above
// is the Mepto-global path; exports below are the treeshakable path.
const _namedKeyCodes: Record<string, number> = {
  backspace: 8,
  tab: 9,
  enter: 13,
  shift: 16,
  ctrl: 17,
  control: 17,
  alt: 18,
  capslock: 20,
  escape: 27,
  esc: 27,
  space: 32,
  ' ': 32,
  pageup: 33,
  pagedown: 34,
  end: 35,
  home: 36,
  arrowleft: 37,
  arrowup: 38,
  arrowright: 39,
  arrowdown: 40,
  left: 37,
  up: 38,
  right: 39,
  down: 40,
  insert: 45,
  delete: 46,
  meta: 91,
  cmd: 91,
  command: 91,
  f1: 112,
  f2: 113,
  f3: 114,
  f4: 115,
  f5: 116,
  f6: 117,
  f7: 118,
  f8: 119,
  f9: 120,
  f10: 121,
  f11: 122,
  f12: 123,
}
function _keyToCode(key: string): number {
  if (!key) return 0
  const lower = key.toLowerCase()
  if (_namedKeyCodes[lower] !== undefined) return _namedKeyCodes[lower]
  if (key.length === 1) return key.toUpperCase().charCodeAt(0)
  return 0
}
export function keyToCode(key: string): number {
  return _keyToCode(key)
}
export function encode(e: KeyboardEvent): number {
  let mask = 0
  if (e.ctrlKey) mask |= CTRL
  if (e.altKey) mask |= ALT
  if (e.shiftKey) mask |= SHIFT
  if (e.metaKey) mask |= META
  const code =
    (e as unknown as { keyCode?: number }).keyCode ||
    (e as unknown as { which?: number }).which ||
    _keyToCode(e.key || '')
  return mask | (code & 0xff)
}
export function parse(binding: string): number {
  if (!binding || typeof binding !== 'string') return 0
  const parts = binding
    .split(/[+-]/)
    .map(s => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return 0
  let mask = 0
  let keyPart = ''
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toLowerCase()
    if (p === 'ctrl' || p === 'control') mask |= CTRL
    else if (p === 'alt' || p === 'option') mask |= ALT
    else if (p === 'shift') mask |= SHIFT
    else if (p === 'meta' || p === 'cmd' || p === 'command' || p === 'win' || p === 'super')
      mask |= META
    else if (p === 'mod' || p === '$mod') mask |= isMac ? META : CTRL
    else {
      keyPart = parts.slice(i).join('+')
      break
    }
  }
  if (!keyPart && parts.length === 1) keyPart = parts[0]
  const normalized = keyPart.replace(/\+/g, '')
  const code = _keyToCode(normalized) || _keyToCode(keyPart)
  return mask | (code & 0xff)
}
export function shouldIgnore(e: KeyboardEvent): boolean {
  return !!(
    e.repeat ||
    e.isComposing ||
    (e as unknown as { keyCode?: number }).keyCode === 229 ||
    e.key === 'Process' ||
    e.key === 'Dead'
  )
}
export const hotkey = {
  CTRL,
  ALT,
  SHIFT,
  META,
  CMD,
  encode,
  parse,
  shouldIgnore,
  keyToCode: _keyToCode,
} as const
export default hotkey
