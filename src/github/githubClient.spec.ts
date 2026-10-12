import { describe, expect, it } from 'vitest';
import { GitHubError, createGitHubClient } from './githubClient';

const repo = { owner: 'o', repo: 'r' };

function stub(status: number, payload: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), { status });
  };
  return { fetchFn, calls };
}

describe('createGitHubClient', () => {
  it('creates an issue with auth headers and returns its number and URL', async () => {
    const { fetchFn, calls } = stub(201, {
      number: 7,
      html_url: 'https://github.com/o/r/issues/7',
    });
    const client = createGitHubClient('tok', repo, fetchFn);

    const created = await client.createIssue({
      title: 't',
      body: 'b',
      labels: ['enhancement'],
      milestone: 2,
      assignees: [],
    });

    expect(created).toEqual({ number: 7, url: 'https://github.com/o/r/issues/7' });
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/issues');
    expect(calls[0].init?.method).toBe('POST');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({ title: 't', milestone: 2 });
  });

  it('creates a milestone', async () => {
    const { fetchFn, calls } = stub(201, {
      number: 3,
      html_url: 'https://github.com/o/r/milestone/3',
    });
    const created = await createGitHubClient('tok', repo, fetchFn).createMilestone({ title: 'v1' });
    expect(created.number).toBe(3);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/milestones');
  });

  it('lists open milestones and labels, keeping only what the form needs', async () => {
    const milestones = stub(200, [{ number: 1, title: 'v1', open_issues: 4 }]);
    expect(await createGitHubClient('t', repo, milestones.fetchFn).listOpenMilestones()).toEqual([
      { number: 1, title: 'v1' },
    ]);
    const labels = stub(200, [{ name: 'bug', color: 'f00' }]);
    expect(await createGitHubClient('t', repo, labels.fetchFn).listLabels()).toEqual(['bug']);
  });

  it.each([
    [401, 'credentials'],
    [403, 'write access'],
    [404, 'not found'],
    [410, 'disabled'],
  ])('explains HTTP %i', async (status, fragment) => {
    const { fetchFn } = stub(status, { message: 'x' });
    const error = await createGitHubClient('t', repo, fetchFn)
      .createIssue({ title: 't', body: '', labels: [], assignees: [] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).message).toContain(fragment);
    expect((error as GitHubError).status).toBe(status);
  });

  it('includes GitHub validation details for HTTP 422', async () => {
    const { fetchFn } = stub(422, {
      message: 'Validation Failed',
      errors: [{ message: 'milestone does not exist' }],
    });
    const error = await createGitHubClient('t', repo, fetchFn)
      .createIssue({ title: 't', body: '', labels: [], assignees: [] })
      .catch((e: unknown) => e);
    expect((error as GitHubError).message).toContain(
      'Validation Failed — milestone does not exist',
    );
  });

  it('reports network failures without a status', async () => {
    const client = createGitHubClient('t', repo, async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const error = await client.listLabels().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).status).toBeUndefined();
    expect((error as GitHubError).message).toContain('Could not reach GitHub');
  });

  it('copes with a non-JSON error body', async () => {
    const client = createGitHubClient(
      't',
      repo,
      async () => new Response('<html>', { status: 502 }),
    );
    const error = await client.listLabels().catch((e: unknown) => e);
    expect((error as GitHubError).message).toBe('GitHub request failed (HTTP 502).');
  });

  it('reads an issue title and state', async () => {
    const { fetchFn, calls } = stub(200, { title: 'Crash', state: 'open', body: 'ignored' });
    const issue = await createGitHubClient('t', repo, fetchFn).getIssue(12);
    expect(issue).toEqual({ title: 'Crash', state: 'open' });
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/issues/12');
  });

  it('creates a pull request', async () => {
    const { fetchFn, calls } = stub(201, { number: 5, html_url: 'https://github.com/o/r/pull/5' });
    const created = await createGitHubClient('t', repo, fetchFn).createPullRequest({
      title: 'feat: x',
      body: 'b',
      head: 'feat/x',
      base: 'main',
    });
    expect(created).toEqual({ number: 5, url: 'https://github.com/o/r/pull/5' });
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/pulls');
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({
      head: 'feat/x',
      base: 'main',
    });
  });
});
