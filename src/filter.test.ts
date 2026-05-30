import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedPath, sumRealChurn } from './filter.js';

test('isGeneratedPath flags lockfiles at any depth', () => {
  assert.ok(isGeneratedPath('pnpm-lock.yaml'));
  assert.ok(isGeneratedPath('package-lock.json'));
  assert.ok(isGeneratedPath('apps/web/yarn.lock'));
  assert.ok(isGeneratedPath('go.sum'));
  assert.ok(isGeneratedPath('crates/core/Cargo.lock'));
});

test('isGeneratedPath flags generated, vendored, and build paths', () => {
  assert.ok(isGeneratedPath('src/__generated__/types.ts'));
  assert.ok(isGeneratedPath('proto/foo.pb.go'));
  assert.ok(isGeneratedPath('dist/index.js'));
  assert.ok(isGeneratedPath('apps/web/.next/static/chunk.js'));
  assert.ok(isGeneratedPath('vendor/lib/thing.rb'));
  assert.ok(isGeneratedPath('web/bundle.min.js'));
});

test('isGeneratedPath leaves real source alone', () => {
  assert.equal(isGeneratedPath('src/index.ts'), false);
  assert.equal(isGeneratedPath('lib/parser.py'), false);
  assert.equal(isGeneratedPath('README.md'), false);
  assert.equal(isGeneratedPath('packages/core/src/compile.ts'), false);
});

test('isGeneratedPath over-matches a "build/" dir anywhere (known tradeoff)', () => {
  // Mirrors team-perf: any path under a `build/` segment is treated as an
  // artifact. Accepted as a conservative LOC filter; documented, not a bug.
  assert.ok(isGeneratedPath('packages/core/src/build/compile.ts'));
});

test('sumRealChurn excludes noise but counts source', () => {
  const churn = sumRealChurn([
    { filename: 'src/app.ts', additions: 100, deletions: 10 },
    { filename: 'pnpm-lock.yaml', additions: 5000, deletions: 4000 },
    { filename: 'src/util.ts', additions: 20, deletions: 5 },
    { filename: 'dist/app.js', additions: 9999, deletions: 0 },
  ]);
  assert.deepEqual(churn, { additions: 120, deletions: 15 });
});
