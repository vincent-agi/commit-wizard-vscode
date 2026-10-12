import { describe, expect, it } from 'vitest';
import {
  RELEASE_PR_LABEL,
  findReleasePr,
  summarizeCheckRuns,
  versionFromReleaseTitle,
} from './releasePr';

const pr = (number: number, labels: string[]) => ({
  number,
  title: `t${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  labels,
  headSha: 'abc',
});

describe('findReleasePr', () => {
  it('returns the pull request carrying the Release Please label', () => {
    expect(findReleasePr([pr(1, ['bug']), pr(2, [RELEASE_PR_LABEL])])?.number).toBe(2);
  });

  it('returns undefined when there is none', () => {
    expect(findReleasePr([pr(1, ['bug'])])).toBeUndefined();
    expect(findReleasePr([])).toBeUndefined();
  });
});

describe('versionFromReleaseTitle', () => {
  it.each([
    ['chore(main): release 0.2.0', '0.2.0'],
    ['chore: release v1.4.0-beta.1', '1.4.0-beta.1'],
    ['chore(main): Release 2.0.0', '2.0.0'],
  ])('%s -> %s', (title, version) => {
    expect(versionFromReleaseTitle(title)).toBe(version);
  });

  it('returns undefined for other titles', () => {
    expect(versionFromReleaseTitle('feat: add release notes')).toBeUndefined();
  });
});

describe('summarizeCheckRuns', () => {
  const done = (conclusion: string) => ({ status: 'completed', conclusion });

  it('is "none" without checks', () => {
    expect(summarizeCheckRuns([])).toEqual({ state: 'none', total: 0, failed: 0, pending: 0 });
  });

  it('is "success" when everything passed, skipped or was neutral', () => {
    expect(summarizeCheckRuns([done('success'), done('skipped'), done('neutral')]).state).toBe(
      'success',
    );
  });

  it('is "failure" as soon as one run failed, even with pending ones', () => {
    const summary = summarizeCheckRuns([
      done('success'),
      done('failure'),
      { status: 'in_progress', conclusion: null },
    ]);
    expect(summary).toEqual({ state: 'failure', total: 3, failed: 1, pending: 1 });
  });

  it('is "pending" when some runs are unfinished', () => {
    expect(
      summarizeCheckRuns([done('success'), { status: 'queued', conclusion: null }]).state,
    ).toBe('pending');
  });
});
