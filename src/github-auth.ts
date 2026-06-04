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
import { makeOctokit } from './github.js';

/** The resolved auth strategy: a token, or a GitHub App installation. */
export type GitHubAuth =
  | { mode: 'pat'; token: string }
  | { mode: 'app'; appId: string; privateKey: string; installationId?: number };

/**
 * Decide how to authenticate, purely from config + secrets:
 *   - GitHub App if an app id (config `github.appId` or env `GITHUB_APP_ID`) AND a
 *     private key (env `GITHUB_APP_PRIVATE_KEY` / `_PATH`) are both present. The
 *     App is the upgrade, so it wins when a PAT is also set.
 *   - otherwise a PAT (`GITHUB_TOKEN` / `GH_TOKEN`).
 *   - otherwise throw — no credentials at all.
 */
export function selectGitHubAuth(config: Config, secrets: Secrets): GitHubAuth {
  const appId = config.github.appId ?? secrets.githubAppId;
  const privateKey = secrets.githubAppPrivateKey;
  if (appId && privateKey) {
    return { mode: 'app', appId, privateKey, installationId: config.github.installationId };
  }
  if (secrets.githubToken) {
    return { mode: 'pat', token: secrets.githubToken };
  }
  throw new Error(
    'No GitHub credentials. Either set GITHUB_TOKEN (a PAT / fine-grained token with ' +
      'repo read), or configure a GitHub App: github.appId in config (or GITHUB_APP_ID) ' +
      'plus GITHUB_APP_PRIVATE_KEY (or GITHUB_APP_PRIVATE_KEY_PATH). ' +
      'See docs/github-app-setup.md.',
  );
}

/**
 * Build an authenticated Octokit for the configured org. PAT mode is the same
 * single-token client as before; App mode uses Octokit's app-auth strategy,
 * which mints and auto-refreshes short-lived installation tokens (ideal for the
 * long-running worker). When no `installationId` is pinned, it's looked up from
 * the org once (and logged so it can be pinned to skip the lookup next time).
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
    // App-level (JWT) client just to discover the org's installation id.
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: auth.appId, privateKey: auth.privateKey },
      userAgent: 'inky',
    });
    const { data } = await appOctokit.rest.apps.getOrgInstallation({ org: config.org });
    installationId = data.id;
    log(
      `inky: using GitHub App installation ${installationId} for ${config.org} ` +
        '(pin it as github.installationId in config to skip this lookup)',
    );
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: auth.appId, privateKey: auth.privateKey, installationId },
    userAgent: 'inky',
  });
}
