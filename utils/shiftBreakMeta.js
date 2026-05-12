/**
 * Re-exports shift break / pay helpers for bundlers that resolve `.js` (Vite / Metro).
 * Implementation is ESM-only in `shiftBreakMeta.mjs` (no `module` in the browser).
 */
export * from './shiftBreakMeta.mjs';
export { default } from './shiftBreakMeta.mjs';
