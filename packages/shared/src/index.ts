/**
 * index.ts — @open-escrow/shared
 *
 * Root export for the shared package.
 * Handles: re-exporting all shared types, constants, and ABI references.
 * Does NOT: contain business logic, interact with DB, or make network calls.
 */

export * from './types/index.js';
// ABIs exported separately via package exports map (see package.json)
