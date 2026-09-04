/**
 * Test-only entry point: `@scholis/db/testing`.
 *
 * Separate from the package root so PGlite and the migrator never enter the
 * production import path.
 */
export * from './factories';
export { createTestDb, type TestDb } from './harness';
