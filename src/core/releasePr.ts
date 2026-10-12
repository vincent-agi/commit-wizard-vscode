/** Label Release Please puts on its open release pull request. */
export const RELEASE_PR_LABEL = 'autorelease: pending';

export interface ReleasePrCandidate {
  number: number;
  title: string;
  url: string;
  labels: string[];
  headSha: string;
}

export interface CheckRunSummary {
  state: 'success' | 'failure' | 'pending' | 'none';
  total: number;
  failed: number;
  pending: number;
}

/** Finds the open release pull request among open pull requests, or `undefined`. */
export function findReleasePr(
  pulls: readonly ReleasePrCandidate[],
): ReleasePrCandidate | undefined {
  return pulls.find((pull) => pull.labels.includes(RELEASE_PR_LABEL));
}

/** Extracts the proposed version from a title like `chore(main): release 0.2.0`. */
export function versionFromReleaseTitle(title: string): string | undefined {
  return title.match(/\brelease\s+v?(\d+\.\d+\.\d+[\w.+-]*)/i)?.[1];
}

const FAILING = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
]);
const PASSING = new Set(['success', 'neutral', 'skipped']);

/**
 * Summarizes GitHub check runs: any failing run makes the whole summary `failure`, otherwise any
 * unfinished run makes it `pending`.
 */
export function summarizeCheckRuns(
  runs: readonly { status: string; conclusion: string | null }[],
): CheckRunSummary {
  let failed = 0;
  let pending = 0;
  for (const run of runs) {
    if (run.status !== 'completed') {
      pending++;
    } else if (run.conclusion && FAILING.has(run.conclusion)) {
      failed++;
    } else if (!run.conclusion || !PASSING.has(run.conclusion)) {
      pending++;
    }
  }
  const state =
    runs.length === 0 ? 'none' : failed > 0 ? 'failure' : pending > 0 ? 'pending' : 'success';
  return { state, total: runs.length, failed, pending };
}
