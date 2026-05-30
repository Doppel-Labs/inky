/**
 * GitHub API layer. Reads org activity for a time window via Octokit (REST).
 *
 * Design notes:
 * - We read the API, not local clones, so Herald works on org repos nobody has
 *   checked out (mandatory for the future hosted tier).
 * - "Active in window" PRs = PRs whose updated_at >= since. Because a review or
 *   merge bumps updated_at, this set also surfaces reviews on older PRs.
 * - Per-item enrichment (commit/PR line counts) is bounded-concurrency and
 *   best-effort: a failed enrichment degrades to 0 lines, never aborts the run.
 */
import { Octokit } from '@octokit/rest';
import { sumRealChurn } from './filter.js';
import type { RawIdentity } from './identity.js';
import type {
  CommitActivity,
  IssueActivity,
  PullRequestActivity,
  PullRequestState,
  ReviewActivity,
  ReviewState,
  Window,
} from './types.js';

export function makeOctokit(token: string): Octokit {
  return new Octokit({ auth: token, userAgent: 'herald' });
}

/** Compute a window ending now, spanning `hours` back. */
export function computeWindow(hours: number, now: Date): Window {
  const until = now;
  const since = new Date(now.getTime() - hours * 3600_000);
  return { since: since.toISOString(), until: until.toISOString() };
}

/** Run async work over items with a concurrency cap, preserving input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** List non-archived repo names in an org (no owner prefix). */
export async function listOrgRepos(octokit: Octokit, org: string): Promise<string[]> {
  const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org,
    type: 'all',
    per_page: 100,
  });
  return repos.filter((r) => !r.archived).map((r) => r.name);
}

function inWindow(iso: string | null | undefined, w: Window): boolean {
  if (!iso) return false;
  return iso >= w.since && iso <= w.until;
}

export interface CommitRecord {
  author: RawIdentity;
  commit: CommitActivity;
}

/** Fetch commits authored in the window across the repo's default branch history. */
export async function fetchCommits(
  octokit: Octokit,
  org: string,
  repo: string,
  window: Window,
): Promise<CommitRecord[]> {
  const list = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: org,
    repo,
    since: window.since,
    until: window.until,
    per_page: 100,
  });

  return mapLimit(list, 5, async (c) => {
    const author: RawIdentity = {
      login: c.author?.login ?? null,
      email: c.commit.author?.email ?? null,
      name: c.commit.author?.name ?? null,
      avatarUrl: c.author?.avatar_url ?? null,
    };
    let additions = 0;
    let deletions = 0;
    try {
      const full = await octokit.rest.repos.getCommit({ owner: org, repo, ref: c.sha });
      // Sum only "real" churn — exclude lockfiles/generated/vendored paths.
      const churn = sumRealChurn(
        (full.data.files ?? []).map((f) => ({
          filename: f.filename,
          additions: f.additions ?? 0,
          deletions: f.deletions ?? 0,
        })),
      );
      additions = churn.additions;
      deletions = churn.deletions;
    } catch {
      // best-effort: leave line counts at 0
    }
    const commit: CommitActivity = {
      repo,
      sha: c.sha,
      message: c.commit.message.split('\n', 1)[0]!,
      additions,
      deletions,
      url: c.html_url,
      authoredAt: c.commit.author?.date ?? window.until,
    };
    return { author, commit };
  });
}

export interface PullRequestRecord {
  author: RawIdentity;
  pr: PullRequestActivity;
}

/** A lightweight ref to a PR active in-window, used to fetch its reviews. */
export interface ActivePR {
  number: number;
  title: string;
  authorLogin: string | null;
}

function classifyPrState(pr: {
  state: string;
  draft?: boolean | null;
  merged_at?: string | null;
}): PullRequestState {
  if (pr.merged_at) return 'merged';
  if (pr.state === 'closed') return 'closed';
  if (pr.draft) return 'draft';
  return 'open';
}

/**
 * Fetch PRs with any activity in the window (updated_at >= since), plus the set
 * of active PRs so the caller can fetch their reviews. Only PRs *created*,
 * *merged*, or *closed* in-window become PullRequest activity records; PRs that
 * were merely reviewed in-window still appear in `active` for review fetching.
 */
export async function fetchPullRequests(
  octokit: Octokit,
  org: string,
  repo: string,
  window: Window,
): Promise<{ records: PullRequestRecord[]; active: ActivePR[] }> {
  const records: PullRequestRecord[] = [];
  const active: ActivePR[] = [];

  // Sorted by updated desc so we can stop once we pass the window's start.
  const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
    owner: org,
    repo,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });

  outer: for await (const { data: page } of iterator) {
    for (const pr of page) {
      if (pr.updated_at < window.since) break outer; // everything older follows
      active.push({ number: pr.number, title: pr.title, authorLogin: pr.user?.login ?? null });

      const touchedInWindow =
        inWindow(pr.created_at, window) ||
        inWindow(pr.merged_at, window) ||
        inWindow(pr.closed_at, window);
      if (!touchedInWindow) continue;

      let additions = 0;
      let deletions = 0;
      try {
        const full = await octokit.rest.pulls.get({ owner: org, repo, pull_number: pr.number });
        additions = full.data.additions;
        deletions = full.data.deletions;
      } catch {
        // best-effort
      }
      records.push({
        author: {
          login: pr.user?.login ?? null,
          avatarUrl: pr.user?.avatar_url ?? null,
        },
        pr: {
          repo,
          number: pr.number,
          title: pr.title,
          state: classifyPrState(pr),
          additions,
          deletions,
          url: pr.html_url,
          createdAt: pr.created_at,
          mergedAt: pr.merged_at ?? undefined,
          closedAt: pr.closed_at ?? undefined,
        },
      });
    }
  }
  return { records, active };
}

export interface ReviewRecord {
  author: RawIdentity;
  review: ReviewActivity;
}

function normalizeReviewState(state: string | undefined): ReviewState | null {
  switch (state) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes_requested';
    case 'COMMENTED':
      return 'commented';
    case 'DISMISSED':
      return 'dismissed';
    default:
      return null; // PENDING and unknown states are ignored
  }
}

/** Fetch reviews submitted in-window across the given active PRs. */
export async function fetchReviews(
  octokit: Octokit,
  org: string,
  repo: string,
  window: Window,
  prs: ActivePR[],
): Promise<ReviewRecord[]> {
  const perPr = await mapLimit(prs, 5, async (pr) => {
    let reviews;
    try {
      reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
        owner: org,
        repo,
        pull_number: pr.number,
        per_page: 100,
      });
    } catch {
      return [] as ReviewRecord[];
    }
    const out: ReviewRecord[] = [];
    for (const rev of reviews) {
      const state = normalizeReviewState(rev.state);
      if (!state || !inWindow(rev.submitted_at, window)) continue;
      // Don't count self-reviews.
      if (rev.user?.login && pr.authorLogin && rev.user.login === pr.authorLogin) continue;
      out.push({
        author: { login: rev.user?.login ?? null, avatarUrl: rev.user?.avatar_url ?? null },
        review: {
          repo,
          pullRequestNumber: pr.number,
          pullRequestTitle: pr.title,
          state,
          pullRequestAuthor: pr.authorLogin ?? 'unknown',
          url: rev.html_url,
          submittedAt: rev.submitted_at!,
        },
      });
    }
    return out;
  });
  return perPr.flat();
}

export interface IssueRecord {
  author: RawIdentity;
  issue: IssueActivity;
}

/** Fetch issues (not PRs) opened or closed in-window. */
export async function fetchIssues(
  octokit: Octokit,
  org: string,
  repo: string,
  window: Window,
): Promise<IssueRecord[]> {
  const list = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: org,
    repo,
    state: 'all',
    since: window.since,
    per_page: 100,
  });

  const out: IssueRecord[] = [];
  for (const issue of list) {
    if (issue.pull_request) continue; // listForRepo includes PRs; skip them
    const openedInWindow = inWindow(issue.created_at, window);
    const closedInWindow = inWindow(issue.closed_at, window);
    if (!openedInWindow && !closedInWindow) continue;

    const action: IssueActivity['action'] = openedInWindow ? 'opened' : 'closed';
    out.push({
      author: { login: issue.user?.login ?? null, avatarUrl: issue.user?.avatar_url ?? null },
      issue: {
        repo,
        number: issue.number,
        title: issue.title,
        state: issue.state === 'closed' ? 'closed' : 'open',
        action,
        url: issue.html_url,
        at: openedInWindow ? issue.created_at : issue.closed_at ?? issue.updated_at,
      },
    });
  }
  return out;
}
