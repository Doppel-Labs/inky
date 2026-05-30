/**
 * render() — turn normalized OrgActivity into a human-readable standup.
 *
 * Phase 2 is the *mechanical* renderer: deterministic markdown straight from the
 * activity, no AI. It doubles as the fallback when no Anthropic key is set, and
 * as the ground truth the Phase 3 summarizer is checked against. Output is
 * Discord-flavored markdown; the delivery layer handles chunking.
 *
 * It is commit-centric: the goal is to show what people *worked on*, shipped or
 * not. Merged feature PRs are highlighted as shipped work; commits on feature
 * branches are surfaced as in-progress work. Promotion/merge PRs (e.g. "Staging",
 * "main → production") are filtered out as noise.
 */
import type { CommitActivity, OrgActivity, PersonActivity, PullRequestActivity } from './types.js';

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * True for promotion/merge PRs that carry no feature signal: branch-promotion
 * ("Staging", "staging → main", "Promote: …"), env names, or "Merge X into Y".
 */
export function isPromotionPR(title: string): boolean {
  const t = title.trim();
  if (/^(staging|main|master|production|prod|dev|develop|release)$/i.test(t)) return true;
  if (/^promote\b/i.test(t)) return true;
  if (/^merge\b.*\binto\b/i.test(t)) return true;
  if (/\b(staging|main|master|production)\s*(→|->|=>|to)\s*(main|master|production|prod)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** A compact one-line stats summary, omitting zero-valued parts. */
function statLine(p: PersonActivity): string {
  const t = p.totals;
  const parts: string[] = [];
  if (t.commits) {
    const wip = t.unshippedCommits ? ` (${t.unshippedCommits} unshipped)` : '';
    parts.push(`${t.commits} commit${t.commits === 1 ? '' : 's'}${wip}`);
  }
  if (t.additions || t.deletions) parts.push(`+${fmtNum(t.additions)}/−${fmtNum(t.deletions)}`);
  const prBits: string[] = [];
  if (t.prsOpened) prBits.push(`${t.prsOpened} opened`);
  if (t.prsMerged) prBits.push(`${t.prsMerged} merged`);
  if (prBits.length) parts.push(`PRs: ${prBits.join(', ')}`);
  if (t.reviewsGiven) parts.push(`${t.reviewsGiven} review${t.reviewsGiven === 1 ? '' : 's'}`);
  const issueBits: string[] = [];
  if (t.issuesOpened) issueBits.push(`${t.issuesOpened} opened`);
  if (t.issuesClosed) issueBits.push(`${t.issuesClosed} closed`);
  if (issueBits.length) parts.push(`issues: ${issueBits.join(', ')}`);
  if (t.repos > 1) parts.push(`${t.repos} repos`);
  return parts.join(' · ');
}

/** Deduplicate commits by first-line message + repo (rebases/cherry-picks repeat). */
function dedupeCommits(commits: CommitActivity[]): CommitActivity[] {
  const seen = new Set<string>();
  const out: CommitActivity[] = [];
  for (const c of commits) {
    const key = `${c.repo}:${c.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function prLine(pr: PullRequestActivity): string {
  return `✅ shipped [#${pr.number}](${pr.url}) ${pr.title} \`${pr.repo}\``;
}

function commitLine(c: CommitActivity): string {
  const where = c.unshipped && c.branch ? ` \`${c.repo}@${c.branch}\`` : ` \`${c.repo}\``;
  const tag = c.unshipped ? '🔧 ' : '• ';
  return `${tag}${c.message}${where}`;
}

/**
 * Build the highlight lines for a person: shipped feature PRs first, then a
 * sample of commit work (in-progress commits prioritized), then reviews.
 */
function highlights(p: PersonActivity, opts: { commitSample: number }): string[] {
  const lines: string[] = [];

  const featurePRs = p.pullRequests.filter((pr) => pr.state === 'merged' && !isPromotionPR(pr.title));
  for (const pr of featurePRs.slice(0, 5)) lines.push(prLine(pr));

  // Commit work, in-progress first so unshipped effort is visible.
  const commits = dedupeCommits(p.commits).filter((c) => !/^merge\b/i.test(c.message));
  commits.sort((a, b) => Number(b.unshipped) - Number(a.unshipped));
  for (const c of commits.slice(0, opts.commitSample)) lines.push(commitLine(c));

  const reviewed = p.reviews.length;
  if (reviewed) lines.push(`👀 reviewed ${reviewed} PR${reviewed === 1 ? '' : 's'}`);

  return lines;
}

export interface RenderOptions {
  /** Title prefix. Defaults to a calendar emoji + "Daily Standup". */
  title?: string;
  /** Max commit lines to show per person (default 5). */
  commitSample?: number;
}

/** Render the full mechanical standup as Discord-flavored markdown. */
export function renderMechanical(activity: OrgActivity, opts: RenderOptions = {}): string {
  const { org, window, people } = activity;
  const title = opts.title ?? '📋 Daily Standup';
  const commitSample = opts.commitSample ?? 5;
  const day = fmtDate(window.until);
  const span = fmtDate(window.since) === day ? day : `${fmtDate(window.since)} → ${day}`;

  const out: string[] = [];
  out.push(`# ${title} — ${org}`);
  out.push(`**${span}** · ${people.length} contributor${people.length === 1 ? '' : 's'} active`);
  out.push('');

  if (people.length === 0) {
    out.push('_No GitHub activity in this window._');
    return out.join('\n');
  }

  for (const p of people) {
    const name =
      p.person.displayName && p.person.displayName !== p.person.login
        ? `${p.person.displayName} (\`${p.person.login}\`)`
        : `\`${p.person.login}\``;
    out.push(`## ${name}`);
    const stats = statLine(p);
    if (stats) out.push(`*${stats}*`);
    for (const line of highlights(p, { commitSample })) out.push(`- ${line}`);
    out.push('');
  }

  out.push('—');
  out.push('_Generated by Herald from GitHub activity (all branches). Reflects code activity only._');
  return out.join('\n').trimEnd() + '\n';
}
