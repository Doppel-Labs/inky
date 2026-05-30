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
import type {
  CommitActivity,
  OrgActivity,
  OrgTotals,
  PersonActivity,
  PersonStandup,
  PullRequestActivity,
  Standup,
} from './types.js';

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** A standup label that matches the actual window, so a 3-day view isn't "Daily". */
export function windowLabel(window: { since: string; until: string }): string {
  const hours = Math.round(
    (new Date(window.until).getTime() - new Date(window.since).getTime()) / 3_600_000,
  );
  if (hours < 20) return `Standup — last ${hours}h`; // sub-day window
  if (hours <= 26) return 'Daily Standup'; // ~24h, with slack
  const days = Math.round(hours / 24);
  if (days === 7) return 'Weekly Standup';
  if (Math.abs(hours - days * 24) <= 1) return `${days}-Day Standup`;
  return `Standup — last ${hours}h`;
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
  /** Show the team-level stats panel (renderStandup only). */
  showStats?: boolean;
  /** Also show a per-person stat line under each name (renderStandup only). */
  statsPerPerson?: boolean;
}

/** Render the full mechanical standup as Discord-flavored markdown. */
export function renderMechanical(activity: OrgActivity, opts: RenderOptions = {}): string {
  const { org, window, people } = activity;
  const title = opts.title ?? `📋 ${windowLabel(window)}`;
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

/** A short relative phrase for stats headings, from the window length. */
function statsPeriod(window: { since: string; until: string }): string {
  const hours = Math.round(
    (new Date(window.until).getTime() - new Date(window.since).getTime()) / 3_600_000,
  );
  if (hours <= 26) return 'today';
  const days = Math.round(hours / 24);
  if (days === 7) return 'this week';
  if (days >= 28 && days <= 31) return 'this month';
  return `last ${days} days`;
}

/**
 * Team-level stats panel. Deliberately team-only and labels lines as size rather
 * than score — these inform, they are not a leaderboard (see docs/research).
 */
function teamStatsPanel(t: OrgTotals, window: { since: string; until: string }): string[] {
  const lines = [`### 📊 Team stats — ${statsPeriod(window)}`];
  lines.push(
    `- **${t.prsMerged}** PRs merged` + (t.prsOpened ? `, **${t.prsOpened}** opened` : ''),
  );
  lines.push(
    `- **${t.commits}** commits` +
      (t.unshippedCommits ? ` (**${t.unshippedCommits}** unshipped)` : ''),
  );
  if (t.reviews) lines.push(`- **${t.reviews}** reviews given`);
  if (t.issuesOpened || t.issuesClosed) {
    lines.push(`- issues: **${t.issuesOpened}** opened, **${t.issuesClosed}** closed`);
  }
  lines.push(`- **${t.repos}** repo${t.repos === 1 ? '' : 's'} touched`);
  lines.push(`- **+${fmtNum(t.additions)} / −${fmtNum(t.deletions)}** lines _(size, not score)_`);
  return lines;
}

/** A compact per-person stat line, omitting zero-valued parts. */
function personTotalsLine(t: NonNullable<PersonStandup['totals']>): string {
  const parts: string[] = [];
  if (t.commits) {
    parts.push(`${t.commits} commit${t.commits === 1 ? '' : 's'}` + (t.unshippedCommits ? ` (${t.unshippedCommits} unshipped)` : ''));
  }
  const prBits: string[] = [];
  if (t.prsMerged) prBits.push(`${t.prsMerged} merged`);
  if (t.prsOpened) prBits.push(`${t.prsOpened} opened`);
  if (prBits.length) parts.push(`PRs: ${prBits.join('/')}`);
  if (t.reviewsGiven) parts.push(`${t.reviewsGiven} review${t.reviewsGiven === 1 ? '' : 's'}`);
  if (t.additions || t.deletions) parts.push(`+${fmtNum(t.additions)}/−${fmtNum(t.deletions)}`);
  if (t.repos > 1) parts.push(`${t.repos} repos`);
  return parts.join(' · ');
}

/**
 * Render an AI-written Standup (output of summarize()) as Discord-flavored
 * markdown. Same shell as renderMechanical — title, span, footer — but the body
 * is the model's prose instead of mechanical bullet lines. Highlights, if any,
 * follow each narrative as bullets (they already carry their own refs). An
 * optional team stats panel and per-person stat lines are gated by opts.
 */
export function renderStandup(standup: Standup, opts: RenderOptions = {}): string {
  const { org, window, projectSummary, people, statusVsPlan } = standup;
  const title = opts.title ?? `📋 ${windowLabel(window)}`;
  const day = fmtDate(window.until);
  const span = fmtDate(window.since) === day ? day : `${fmtDate(window.since)} → ${day}`;

  const out: string[] = [];
  out.push(`# ${title} — ${org}`);
  out.push(`**${span}** · ${people.length} contributor${people.length === 1 ? '' : 's'} active`);
  out.push('');

  // Stats lead the report (numbers first, evaluator-style), then the prose.
  if (opts.showStats && standup.teamTotals) {
    for (const line of teamStatsPanel(standup.teamTotals, window)) out.push(line);
    out.push('');
  }

  if (projectSummary) {
    out.push(projectSummary);
    out.push('');
  }

  if (people.length === 0) {
    out.push('_No GitHub activity in this window._');
    return out.join('\n').trimEnd() + '\n';
  }

  for (const p of people) {
    const name =
      p.person.displayName && p.person.displayName !== p.person.login
        ? `${p.person.displayName} (\`${p.person.login}\`)`
        : `\`${p.person.login}\``;
    out.push(`## ${name}`);
    if (opts.statsPerPerson && p.totals) {
      const line = personTotalsLine(p.totals);
      if (line) out.push(`*${line}*`);
    }
    if (p.narrative) out.push(p.narrative);
    // Group bullets by repo; show a repo subheader only when the person spans >1.
    const multiRepo = p.work.length > 1;
    for (const group of p.work) {
      if (multiRepo) out.push(`**${group.repo}**`);
      for (const pt of group.points) out.push(`- ${pt}`);
    }
    out.push('');
  }

  if (statusVsPlan) {
    out.push('### Status vs. plan');
    out.push(statusVsPlan);
    out.push('');
  }

  out.push('—');
  out.push('_Written by Herald from GitHub activity (all branches). AI-summarized; reflects code activity only._');
  return out.join('\n').trimEnd() + '\n';
}
