/**
 * Mepto - Modern TypeScript fork of Zepto.js
 * A minimalist jQuery-compatible library for modern browsers
 *
 * @version 2.0.0
 * @license MIT
 */

// Core type definitions
export type {
  MeptoStatic,
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
} from './types';

// Import core modules - using require for JS compatibility
import './zepto';
import './event';
import './ajax';
import './form';
import './detect';
import './fx';
import './fx_methods';
import './data';
import './selector';
import './stack';
import './touch';
import './gesture';

// Get the global Zepto object created by zepto.ts
const Mepto = (window as unknown as Record<string, unknown>).Zepto;

// Export the main Mepto object as default and named export
export default Mepto;
export { Mepto };

// Also export as $ for jQuery compatibility
export const $ = Mepto;

// Make it available globally when used via UMD
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).Mepto = Mepto;
  (window as unknown as Record<string, unknown>).$ = Mepto;
}
