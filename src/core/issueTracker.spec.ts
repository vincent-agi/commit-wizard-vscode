import { describe, expect, it } from 'vitest';
import { buildIssueLinks, githubIssueNumber, resolveTracker } from './issueTracker';

describe('resolveTracker', () => {
  it('returns nothing without tracker or overrides', () => {
    expect(resolveTracker({})).toEqual({ pattern: undefined, urlTemplate: undefined });
  });

  it('provides the Jira key pattern and browse URL', () => {
    expect(
      resolveTracker({ tracker: { preset: 'jira', baseUrl: 'https://acme.atlassian.net/' } }),
    ).toEqual({
      pattern: '\\b([A-Z][A-Z0-9]+-\\d+)\\b',
      urlTemplate: 'https://acme.atlassian.net/browse/{id}',
    });
  });

  it('provides the Linear URL', () => {
    expect(
      resolveTracker({ tracker: { preset: 'linear', baseUrl: 'https://linear.app/acme' } })
        .urlTemplate,
    ).toBe('https://linear.app/acme/issue/{id}');
  });

  it('has no link for Jira without a base URL, but still detects keys', () => {
    expect(resolveTracker({ tracker: { preset: 'jira' } })).toMatchObject({
      pattern: expect.any(String),
      urlTemplate: undefined,
    });
  });

  it('derives GitHub links from the repository', () => {
    expect(
      resolveTracker({ tracker: { preset: 'github' } }, { owner: 'o', repo: 'r' }).urlTemplate,
    ).toBe('https://github.com/o/r/issues/{id}');
    expect(resolveTracker({ tracker: { preset: 'github' } }).urlTemplate).toBeUndefined();
  });

  it('lets explicit settings win over the preset', () => {
    expect(
      resolveTracker({
        tracker: { preset: 'jira', baseUrl: 'https://acme.atlassian.net' },
        issuePattern: '(ENG-\\d+)',
        issueUrlTemplate: 'https://tracker.example/{id}',
      }),
    ).toEqual({ pattern: '(ENG-\\d+)', urlTemplate: 'https://tracker.example/{id}' });
  });
});

describe('buildIssueLinks', () => {
  const template = 'https://t.example/browse/{id}';

  it('builds one link per reference and strips a leading #', () => {
    expect(buildIssueLinks('#12, PROJ-3', template)).toEqual([
      { label: '#12', url: 'https://t.example/browse/12' },
      { label: 'PROJ-3', url: 'https://t.example/browse/PROJ-3' },
    ]);
  });

  it('returns nothing without template or references', () => {
    expect(buildIssueLinks('#1', undefined)).toEqual([]);
    expect(buildIssueLinks('', template)).toEqual([]);
    expect(buildIssueLinks(undefined, template)).toEqual([]);
  });

  it('encodes the reference and refuses non http(s) templates', () => {
    expect(buildIssueLinks('a b', template)).toHaveLength(2);
    expect(buildIssueLinks('x/y', template)[0].url).toBe('https://t.example/browse/x%2Fy');
    expect(buildIssueLinks('1', 'javascript:alert({id})')).toEqual([]);
  });
});

describe('githubIssueNumber', () => {
  it('recognizes numeric references only', () => {
    expect(githubIssueNumber('12')).toBe(12);
    expect(githubIssueNumber(' #12 ')).toBe(12);
    expect(githubIssueNumber('PROJ-12')).toBeUndefined();
  });
});
