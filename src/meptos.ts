/**
 * Mepto - Modern TypeScript fork of Zepto.js
 * A minimalist jQuery-compatible library for modern browsers
 *
 * @version 2.0.0
 * @license MIT
 */

// Core type definitions
import type { MeptoStatic } from './types'
export type {
  MeptoCollection,
  MeptoElement,
  AjaxSettings,
  AjaxCompleteCallback,
  AjaxSuccessCallback,
  AjaxErrorCallback,
  DeferredObject,
  PromiseObject,
  EventHandler,
  EventListener,
  PlainObject,
} from './types'

// Import core modules - using require for JS compatibility
import './mepto'
import './callbacks'
import './deferred'
import './event'
import './ajax'
import './form'
import './detect'
import './fx'
import './fx_methods'
import './data'
import './selector'
import './stack'
import './touch'
import './gesture'

// Get the global mepto object created by mepto.ts
const Mepto = (window as unknown as Record<string, unknown>).mepto as MeptoStatic

// Export the main Mepto object as default and named export
export default Mepto
export { Mepto }

// Also export as $ for jQuery compatibility
export const $ = Mepto

// Make it available globally when used via UMD
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  w.Mepto = Mepto
  w.$ = Mepto
}
