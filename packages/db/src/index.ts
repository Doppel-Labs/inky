/**
 * @inky/db public surface — the schema + the pure Config↔DB mapping. The live
 * Drizzle client and migrations (the part that needs a real Postgres connection)
 * land in a follow-up slice; this package is currently schema + mapping only,
 * unit-tested without a database.
 */
export * from './schema.js';
export * from './config-store.js';
