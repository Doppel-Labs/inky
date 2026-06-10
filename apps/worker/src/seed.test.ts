import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configPathFromArgs } from './seed.js';

test('configPathFromArgs reads --config', () => {
  assert.equal(configPathFromArgs(['--config', 'prod.config.json']), 'prod.config.json');
});

test('configPathFromArgs defaults to inky.config.json', () => {
  assert.equal(configPathFromArgs([]), 'inky.config.json');
});

test('configPathFromArgs throws when --config has no value', () => {
  assert.throws(() => configPathFromArgs(['--config']), /usage/);
});
