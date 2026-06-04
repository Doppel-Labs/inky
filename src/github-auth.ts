/**
 * GitHub authentication — choose between a personal access token (the self-host
 * MVP default) and a GitHub App installation, and build an authenticated Octokit.
 *
 * Why a GitHub App: per-org install with fine-grained permissions, higher rate
 * limits, no 90-day PAT expiry, and clean revoke (uninstall). It's also the
 * auth foundation the future hosted tier reuses — there the same `app` mode just
 * carries per-tenant installation ids instead of one from config.
 *
 * The *selection* logic is pure (`selectGitHubAuth`) so it's unit-tested without
 * the network; the Octokit *construction* (`resolveOctokit`) is a thin live layer,
 * exercised against the real API like the rest of the GitHub data layer.
 */
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import type { Config, Secrets } from './config.js';
import { USER_AGENT, makeOctokit } from './github.js';

/** The resolved auth strategy: a token, or a GitHub App installation. */
type GitHubAuth =
  | { mode: 'pat'; token: string }
  | { mode: 'app'; appId: string; privateKey: string; installationId?: number };

/**
 * Decide how to authenticate, purely from config + secrets:
 *   - An **app id** (config `github.appId`, else env `GITHUB_APP_ID`) is the signal
 *     of intent to use the App. With one set, a missing or non-PEM private key is a
 *     misconfiguration and throws — we do NOT silently fall back to a PAT, which may
 *     carry broader scopes than the App.
 *   - Otherwise a PAT (`GITHUB_TOKEN` / `GH_TOKEN`).
 *   - Otherwise throw — no credentials at all.
 */
export function selectGitHubAuth(config: Config, secrets: Secrets): GitHubAuth {
  const appId = config.github.appId ?? secrets.githubAppId;
  const privateKey = secrets.githubAppPrivateKey;

  if (appId) {
    if (!privateKey) {
      throw new Error(
        `GitHub App id is configured for "${config.org}" but no private key was loaded. ` +
          'Set GITHUB_APP_PRIVATE_KEY (inline PEM) or a readable GITHUB_APP_PRIVATE_KEY_PATH ' +
          '(a configured path that is missing or unreadable reads as "no key"). ' +
          'See docs/github-app-setup.md.',
      );
    }
    if (!privateKey.includes('-----BEGIN')) {
      throw new Error(
        'The GitHub App private key does not look like a PEM (no "-----BEGIN ... PRIVATE KEY-----" ' +
          'header). Check GITHUB_APP_PRIVATE_KEY / GITHUB_APP_PRIVATE_KEY_PATH holds the full key. ' +
          'See docs/github-app-setup.md.',
      );
    }
    return { mode: 'app', appId, privateKey, installationId: config.github.installationId };
  }

  if (secrets.githubToken) return { mode: 'pat', token: secrets.githubToken };

  throw new Error(
    'No GitHub credentials. Set GITHUB_TOKEN (a PAT / fine-grained token with repo read), ' +
      'or configure a GitHub App: github.appId (or GITHUB_APP_ID) plus a private key ' +
      '(GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH). ' +
      'See docs/github-token-setup.md / docs/github-app-setup.md.',
  );
}

/**
 * Build an authenticated Octokit for the configured org. PAT mode is the same
 * single-token client as before; App mode uses Octokit's app-auth strategy,
 * which mints and auto-refreshes short-lived installation tokens. When no
 * `installationId` is pinned, it's looked up from the org once (and logged so it
 * can be pinned to skip the lookup).
 *
 * NOTE: collect()/collectRoadmap() call this on every run, so the worker rebuilds
 * the Octokit each scheduled tick. With a pinned installationId that's cheap (no
 * lookup) and @octokit/auth-app re-mints the token on demand. For the Phase 6
 * multi-tenant tier, build + cache one Octokit per installation instead of per run.
 */
export async function resolveOctokit(
  config: Config,
  secrets: Secrets,
  log: (msg: string) => void = () => {},
): Promise<Octokit> {
  const auth = selectGitHubAuth(config, secrets);
  if (auth.mode === 'pat') return makeOctokit(auth.token);

  let installationId = auth.installationId;
  if (installationId === undefined) {
    // A temporary app-level (JWT) client, only to discover the org's installation;
    // the client returned below is installation-scoped with the resolved id.
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: auth.appId, privateKey: auth.privateKey },
      userAgent: USER_AGENT,
    });
    try {
      const { data } = await appOctokit.rest.apps.getOrgInstallation({ org: config.org });
      installationId = data.id;
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        throw new Error(
          `The GitHub App isn't installed on "${config.org}" (or can't see it). Open the App's ` +
            'settings → Install App → install it on the org and grant repo access. ' +
            'See docs/github-app-setup.md (step 3).',
        );
      }
      throw new Error(
        `Couldn't resolve the GitHub App installation for "${config.org}": ${(err as Error).message}`,
      );
    }
    log(
      `inky: using GitHub App installation ${installationId} for ${config.org} ` +
        '(pin it as github.installationId in config to skip this lookup)',
    );
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: auth.appId, privateKey: auth.privateKey, installationId },
    userAgent: USER_AGENT,
  });
}
