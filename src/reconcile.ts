/**
 * reconcile() — Phase 5's core: tie the window's GitHub activity to the roadmap
 * (GitHub milestones for the MVP) and produce a mechanical `RoadmapStatus`.
 *
 * Pure and deterministic (the clock is injected), so it's unit-tested with
 * fixtures and no network — like the rest of the core. Every figure here is
 * computed, never model-estimated; summarize() only narrates from it.
 *
 * The architecture slots this between collect() and summarize():
 *   collect() → reconcile() → summarize() → render()
 */
import type {
  IssueActivity,
  ItemMovement,
  RoadmapItem,
  RoadmapItemStatus,
  RoadmapStatus,
  Window,
} from './types.js';
import type { MilestoneRecord } from './github.js';

const DAY_MS = 86_400_000;

export interface ReconcileInput {
  /** Milestones fetched across the configured repos. */
  milestones: MilestoneRecord[];
  /** In-window issues, flattened across people (carry `milestoneNumber`). */
  issues: IssueActivity[];
  window: Window;
}

export interface ReconcileOptions {
  /** Only track milestones whose title contains this (case-insensitive). */
  milestoneFilter?: string;
  /** Flag an item at-risk when its due date is within this many days (or past). */
  atRiskDays: number;
  /** Injected clock for deterministic at-risk math. */
  now: Date;
}

/** Salience order for sorting (lower = surfaced first), within the at-risk split. */
const MOVEMENT_RANK: Record<ItemMovement, number> = {
  stalled: 0,
  advanced: 1,
  completed: 2,
  'in-progress': 3,
  untouched: 4,
};

function toRoadmapItem(m: MilestoneRecord): RoadmapItem {
  return {
    id: `milestone:${m.repo}#${m.number}`,
    kind: 'milestone',
    title: m.title,
    url: m.url,
    repo: m.repo,
    dueOn: m.dueOn,
    openCount: m.openIssues,
    closedCount: m.closedIssues,
    state: m.state,
  };
}

export function reconcile(input: ReconcileInput, opts: ReconcileOptions): RoadmapStatus {
  const filter = opts.milestoneFilter?.toLowerCase();
  const now = opts.now.getTime();
  const riskMs = opts.atRiskDays * DAY_MS;

  // Pre-aggregate the window's issue signals per milestone (repo#number).
  const closedByMs = new Map<string, number>();
  const touchedMs = new Set<string>();
  let unplannedClosed = 0;
  for (const iss of input.issues) {
    if (iss.milestoneNumber == null) {
      if (iss.action === 'closed') unplannedClosed++;
      continue;
    }
    const key = `${iss.repo}#${iss.milestoneNumber}`;
    touchedMs.add(key);
    if (iss.action === 'closed') closedByMs.set(key, (closedByMs.get(key) ?? 0) + 1);
  }

  const items: RoadmapItemStatus[] = [];
  for (const m of input.milestones) {
    if (filter && !m.title.toLowerCase().includes(filter)) continue;

    const key = `${m.repo}#${m.number}`;
    const closedThisWindow = closedByMs.get(key) ?? 0;
    const touched = touchedMs.has(key);

    // Relevance: it's active plan (has open work) or it moved/was touched this window.
    if (!(m.openIssues > 0 || closedThisWindow > 0 || touched)) continue;

    const total = m.openIssues + m.closedIssues;
    const progress = total ? m.closedIssues / total : 0;
    const done = m.state === 'closed' || m.openIssues === 0;

    const dueMs = m.dueOn ? new Date(m.dueOn).getTime() : null;
    const atRisk = dueMs !== null && m.openIssues > 0 && progress < 1 && dueMs <= now + riskMs;

    let movement: ItemMovement;
    if (done && total > 0) movement = 'completed';
    else if (closedThisWindow > 0) movement = 'advanced';
    else if (touched) movement = 'in-progress';
    else if (atRisk) movement = 'stalled';
    else movement = 'untouched';

    let note: string | undefined;
    if (atRisk && dueMs !== null) {
      const days = Math.round((dueMs - now) / DAY_MS);
      note =
        days < 0
          ? `${-days} day${days === -1 ? '' : 's'} overdue`
          : `due in ${days} day${days === 1 ? '' : 's'} · ${m.openIssues} open`;
    }

    items.push({ item: toRoadmapItem(m), movement, closedThisWindow, progress, atRisk, note });
  }

  // At-risk first (most actionable), then by salience, then most-complete first.
  items.sort((a, b) => {
    if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
    if (MOVEMENT_RANK[a.movement] !== MOVEMENT_RANK[b.movement]) {
      return MOVEMENT_RANK[a.movement] - MOVEMENT_RANK[b.movement];
    }
    return b.progress - a.progress;
  });

  return {
    items,
    unplanned: { closedIssues: unplannedClosed },
    totals: {
      tracked: items.length,
      completed: items.filter((i) => i.movement === 'completed').length,
      advanced: items.filter((i) => i.movement === 'advanced').length,
      stalled: items.filter((i) => i.movement === 'stalled').length,
      atRisk: items.filter((i) => i.atRisk).length,
    },
  };
}
