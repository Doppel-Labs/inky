/**
 * LOC noise filtering. Lockfiles, generated code, vendored libs, and build
 * artifacts inflate line counts without representing real engineering effort.
 * For a narrative standup this matters less than for metrics, but "+66k lines"
 * from a regenerated lockfile is actively misleading, so we exclude these paths
 * from line totals. Commit/PR counts are never affected — only LOC.
 *
 * Patterns ported from team-perf's GENERATED_PATH_PATTERNS.
 */
import picomatch from 'picomatch';

/** Paths excluded from LOC counts by default. */
export const GENERATED_PATH_PATTERNS = [
  // Package-manager lockfiles
  '**/*-lock.yaml',
  '**/*-lock.json',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/uv.lock',
  '**/Pipfile.lock',
  '**/Gemfile.lock',
  '**/composer.lock',
  '**/go.sum',
  // Generated code
  '**/__generated__/**',
  '**/generated/**',
  '**/.generated/**',
  '**/*.pb.go',
  '**/*.pb.ts',
  '**/*_pb.py',
  '**/*_pb2.py',
  '**/schema.graphql',
  '**/schema.gql',
  // Minified / bundled artifacts
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.chunk.js',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/out/**',
  // Vendored libraries
  '**/vendor/**',
  '**/third_party/**',
  '**/node_modules/**',
  // Archived / reference content
  '**/_archive/**',
  '**/archive/**',
  '**/.archive/**',
];

// Compile once. `dot: true` so dotfiles/dot-dirs (.next, .generated) match.
const isMatch = picomatch(GENERATED_PATH_PATTERNS, { dot: true });

/** True if a repo-relative path is generated/vendored/archived noise. */
export function isGeneratedPath(path: string): boolean {
  return isMatch(path);
}

/** A per-file churn record, as returned by the GitHub commit/PR file APIs. */
export interface FileChurn {
  filename: string;
  additions: number;
  deletions: number;
}

/** Sum additions/deletions across files, skipping generated/vendored paths. */
export function sumRealChurn(files: FileChurn[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    if (isGeneratedPath(f.filename)) continue;
    additions += f.additions ?? 0;
    deletions += f.deletions ?? 0;
  }
  return { additions, deletions };
}
