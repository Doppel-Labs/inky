/**
 * collect() — the core of Phase 1. Reads org activity for the window across all
 * configured repos, attributes every event to a canonical person via the
 * identity resolver, and normalizes it into the OrgActivity model that
 * summarize() consumes. Pure orchestration over the github + identity layers.
 */
import type { Config, Secrets } from './config.js';
import { createNoiseMatcher } from './filter.js';
import { IdentityResolver } from './identity.js';
import {
  computeWindow,
  fetchCommits,
  fetchIssues,
  fetchPullRequests,
  fetchReviews,
  listOrgRepos,
  makeOctokit,
} from './github.js';
import type {
  CommitActivity,
  IssueActivity,
  OrgActivity,
  PersonActivity,
  PullRequestActivity,
  ReviewActivity,
} from './types.js';

/** Mutable per-person accumulator, keyed by canonical login. */
interface Bucket {
  commits: CommitActivity[];
  pullRequests: PullRequestActivity[];
  reviews: ReviewActivity[];
  issues: IssueActivity[];
}

function emptyBucket(): Bucket {
  return { commits: [], pullRequests: [], reviews: [], issues: [] };
}

export interface CollectOptions {
  /** Injectable clock for deterministic windows/tests. Defaults to now. */
  now?: Date;
  /** Progress sink (defaults to stderr). */
  log?: (msg: string) => void;
}

export async function collect(
  config: Config,
  secrets: Secrets,
  opts: CollectOptions = {},
): Promise<OrgActivity> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));

  const octokit = makeOctokit(secrets.githubToken);
  const window = computeWindow(config.windowHours, now);
  const resolver = new IdentityResolver(config.aliases);
  const isNoise = createNoiseMatcher(config.extraNoisePatterns);
  const buckets = new Map<string, Bucket>();

  const bucketFor = (key: string): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = emptyBucket();
      buckets.set(key, b);
    }
    return b;
  };

  const repos = config.repos.length ? config.repos : await listOrgRepos(octokit, config.org);
  log(`herald: collecting ${config.org} over ${config.windowHours}h across ${repos.length} repo(s)`);

  for (const repo of repos) {
    try {
      const commits = await fetchCommits(octokit, config.org, repo, window, isNoise);
      for (const { author, commit } of commits) {
        bucketFor(resolver.resolve(author)).commits.push(commit);
      }

      const { records: prs, active } = await fetchPullRequests(octokit, config.org, repo, window);
      for (const { author, pr } of prs) {
        bucketFor(resolver.resolve(author)).pullRequests.push(pr);
      }

      const reviews = await fetchReviews(octokit, config.org, repo, window, active);
      for (const { author, review } of reviews) {
        bucketFor(resolver.resolve(author)).reviews.push(review);
      }

      const issues = await fetchIssues(octokit, config.org, repo, window);
      for (const { author, issue } of issues) {
        bucketFor(resolver.resolve(author)).issues.push(issue);
      }

      log(`  ${repo}: ${commits.length} commits, ${prs.length} PRs, ${reviews.length} reviews, ${issues.length} issues`);
    } catch (err) {
      // One bad repo (permissions, empty, etc.) shouldn't sink the whole run.
      log(`  ${repo}: WARN ${(err as Error).message}`);
    }
  }

  const people = [...buckets.entries()]
    .map(([key, b]) => toPersonActivity(resolver, key, b, window))
    .filter((p): p is PersonActivity => p !== null)
    .filter((p) => !(config.excludeBots && isBot(p.person.login)))
    .sort(activityRank);

  return { org: config.org, window, people };
}

/** GitHub bot accounts have logins suffixed with `[bot]` (e.g. `dependabot[bot]`). */
function isBot(login: string): boolean {
  return login.endsWith('[bot]');
}

function toPersonActivity(
  resolver: IdentityResolver,
  key: string,
  b: Bucket,
  window: OrgActivity['window'],
): PersonActivity | null {
  const person = resolver.get(key);
  if (!person) return null;

  const repos = new Set<string>();
  for (const c of b.commits) repos.add(c.repo);
  for (const p of b.pullRequests) repos.add(p.repo);
  for (const r of b.reviews) repos.add(r.repo);
  for (const i of b.issues) repos.add(i.repo);

  const openedInWindow = (iso: string) => iso >= window.since && iso <= window.until;
  const totals: PersonActivity['totals'] = {
    commits: b.commits.length,
    additions: b.commits.reduce((s, c) => s + c.additions, 0),
    deletions: b.commits.reduce((s, c) => s + c.deletions, 0),
    prsOpened: b.pullRequests.filter((p) => openedInWindow(p.createdAt)).length,
    prsMerged: b.pullRequests.filter((p) => p.state === 'merged').length,
    reviewsGiven: b.reviews.length,
    issuesOpened: b.issues.filter((i) => i.action === 'opened').length,
    issuesClosed: b.issues.filter((i) => i.action === 'closed').length,
    repos: repos.size,
  };

  return {
    person,
    commits: b.commits,
    pullRequests: b.pullRequests,
    reviews: b.reviews,
    issues: b.issues,
    totals,
  };
}

/** Sort the most active people first. Commits dominate, then PRs, then reviews. */
function activityRank(a: PersonActivity, b: PersonActivity): number {
  const score = (p: PersonActivity) =>
    p.totals.commits * 3 + p.totals.prsOpened * 2 + p.totals.reviewsGiven + p.totals.issuesOpened;
  return score(b) - score(a);
}
