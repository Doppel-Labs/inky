/**
 * Core domain models for Herald.
 *
 * The pipeline is: collect() -> normalize() -> [reconcile()] -> summarize() -> render()
 * Each stage consumes the previous stage's model. These types are the contract
 * between stages, so the trigger and delivery layers stay thin and swappable.
 */

/** A resolved person, after identity aliasing collapses multiple git identities. */
export interface Person {
  /** Canonical GitHub login (lowercased). The stable key across repos. */
  login: string;
  /** Human display name, best-effort from commit metadata or the GitHub profile. */
  displayName: string;
  /** All git emails seen for this person, after alias merging. */
  emails: string[];
  avatarUrl?: string;
}

/** A time window the standup covers (typically the last 24h). */
export interface Window {
  /** Inclusive ISO-8601 start. */
  since: string;
  /** Exclusive ISO-8601 end. */
  until: string;
}

export type PullRequestState = 'open' | 'draft' | 'merged' | 'closed';
export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'dismissed';
export type IssueState = 'open' | 'closed';

export interface CommitActivity {
  repo: string;
  sha: string;
  message: string;
  additions: number;
  deletions: number;
  url: string;
  /** ISO-8601 author timestamp. */
  authoredAt: string;
}

export interface PullRequestActivity {
  repo: string;
  number: number;
  title: string;
  state: PullRequestState;
  additions: number;
  deletions: number;
  url: string;
  createdAt: string;
  mergedAt?: string;
  closedAt?: string;
}

export interface ReviewActivity {
  repo: string;
  /** The PR that was reviewed. */
  pullRequestNumber: number;
  pullRequestTitle: string;
  state: ReviewState;
  /** The PR author (who received the review), for context. */
  pullRequestAuthor: string;
  url: string;
  submittedAt: string;
}

export interface IssueActivity {
  repo: string;
  number: number;
  title: string;
  state: IssueState;
  /** What the person did to the issue in-window. */
  action: 'opened' | 'closed' | 'commented';
  url: string;
  at: string;
}

/**
 * Everything one person did across the org's repos in the window, after
 * identity aliasing. This is the output of normalize() and the input to
 * summarize(). Counts are derived in normalize() so summarize/render don't recompute.
 */
export interface PersonActivity {
  person: Person;
  commits: CommitActivity[];
  pullRequests: PullRequestActivity[];
  reviews: ReviewActivity[];
  issues: IssueActivity[];
  totals: {
    commits: number;
    additions: number;
    deletions: number;
    prsOpened: number;
    prsMerged: number;
    reviewsGiven: number;
    issuesOpened: number;
    issuesClosed: number;
    /** Distinct repos touched. */
    repos: number;
  };
}

/**
 * The normalized, org-wide activity for a window. Output of normalize().
 * `people` is sorted by descending activity (most active first).
 */
export interface OrgActivity {
  org: string;
  window: Window;
  people: PersonActivity[];
}

/** One person's section of the rendered standup. Output of summarize(). */
export interface PersonStandup {
  person: Person;
  /** AI-written prose: what they did, grounded in their activity. */
  narrative: string;
  /** Optional short bullet highlights (e.g. notable PRs), with refs. */
  highlights: string[];
}

/** The full standup for a day. Output of summarize(), input to render(). */
export interface Standup {
  org: string;
  window: Window;
  /** AI-written org-wide summary: where the project stands today. */
  projectSummary: string;
  people: PersonStandup[];
  /** Phase 5: status reconciled against a task tracker / roadmap. */
  statusVsPlan?: string;
}
