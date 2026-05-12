/**
 * Re-exports NDIS rate helpers for bundlers that resolve `.js` (Vite / Metro).
 * Implementation is ESM-only in `ndisParticipantRates.mjs` (no `module` in the browser).
 */
export * from './ndisParticipantRates.mjs';
export { default } from './ndisParticipantRates.mjs';
