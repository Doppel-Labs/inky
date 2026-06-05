/**
 * The Inky version, read once from this package's package.json. Sent with every
 * telemetry event (helps support + gives an upgrade-adoption signal) and handy
 * anywhere a build needs to name itself.
 *
 * Resolved at runtime relative to this module's URL so it works both compiled
 * (dist/version.js → ../package.json) and run-from-source via tsx
 * (src/version.ts → ../package.json). Never throws — a missing/garbled
 * package.json falls back to "0.0.0" rather than taking the process down.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();
