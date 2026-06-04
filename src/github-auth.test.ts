import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigSchema, loadSecrets, type Secrets } from './config.js';
import { selectGitHubAuth } from './github-auth.js';

const cfg = (over: Record<string, unknown> = {}) => ConfigSchema.parse({ org: 'your-org', ...over });
const secrets = (over: Partial<Secrets> = {}): Secrets => ({ githubToken: '', ...over });

test('PAT mode when only a token is set', () => {
  const auth = selectGitHubAuth(cfg(), secrets({ githubToken: 'ghp_x' }));
  assert.deepEqual(auth, { mode: 'pat', token: 'ghp_x' });
});

test('App mode when an app id + private key are set (App wins over a PAT)', () => {
  const auth = selectGitHubAuth(
    cfg({ github: { appId: '123', installationId: 456 } }),
    secrets({ githubToken: 'ghp_x', githubAppPrivateKey: 'PEM' }),
  );
  assert.deepEqual(auth, { mode: 'app', appId: '123', privateKey: 'PEM', installationId: 456 });
});

test('app id falls back to the GITHUB_APP_ID env value; installationId stays optional', () => {
  const auth = selectGitHubAuth(cfg(), secrets({ githubAppId: '999', githubAppPrivateKey: 'PEM' }));
  assert.equal(auth.mode, 'app');
  if (auth.mode !== 'app') return;
  assert.equal(auth.appId, '999');
  assert.equal(auth.installationId, undefined);
});

test('config.github.appId takes precedence over GITHUB_APP_ID', () => {
  const auth = selectGitHubAuth(
    cfg({ github: { appId: 'cfg' } }),
    secrets({ githubAppId: 'env', githubAppPrivateKey: 'PEM' }),
  );
  assert.equal(auth.mode === 'app' && auth.appId, 'cfg');
});

test('an app id without a private key is not enough — falls back to PAT', () => {
  const auth = selectGitHubAuth(cfg({ github: { appId: '123' } }), secrets({ githubToken: 'ghp_x' }));
  assert.deepEqual(auth, { mode: 'pat', token: 'ghp_x' });
});

test('throws when no credentials are configured', () => {
  assert.throws(() => selectGitHubAuth(cfg(), secrets()), /No GitHub credentials/);
});

test('loadSecrets un-escapes \\n in an inline GITHUB_APP_PRIVATE_KEY', () => {
  const s = loadSecrets({ GITHUB_APP_PRIVATE_KEY: '-----BEGIN-----\\nabc\\n-----END-----' });
  assert.equal(s.githubAppPrivateKey, '-----BEGIN-----\nabc\n-----END-----');
});

test('loadSecrets reads GITHUB_APP_PRIVATE_KEY_PATH from a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inky-key-'));
  const file = join(dir, 'key.pem');
  writeFileSync(file, 'PEM-FROM-FILE');
  const s = loadSecrets({ GITHUB_APP_PRIVATE_KEY_PATH: file });
  assert.equal(s.githubAppPrivateKey, 'PEM-FROM-FILE');
});

test('loadSecrets throws a clear error when the key path is unreadable', () => {
  assert.throws(
    () => loadSecrets({ GITHUB_APP_PRIVATE_KEY_PATH: '/no/such/inky-key.pem' }),
    /Failed to read GITHUB_APP_PRIVATE_KEY_PATH/,
  );
});
