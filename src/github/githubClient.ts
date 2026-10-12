import type { GitHubRepo } from '../core/githubRemote';

/** Error raised for a failed GitHub API call, with a message fit to show the user. */
export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface MilestoneSummary {
  number: number;
  title: string;
}

export interface CreatedResource {
  number: number;
  url: string;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const API = 'https://api.github.com';

function explain(status: number, apiMessage: string | undefined, repo: GitHubRepo): string {
  const slug = `${repo.owner}/${repo.repo}`;
  switch (status) {
    case 401:
      return 'GitHub rejected the credentials. Sign in again and retry.';
    case 403:
      return `Not allowed to do this on ${slug}. Check that your account has write access and that the token has the "repo" scope.`;
    case 404:
      return `Repository ${slug} not found, or your account cannot access it.`;
    case 410:
      return `Issues are disabled on ${slug}.`;
    case 422:
      return `GitHub refused the data${apiMessage ? `: ${apiMessage}` : '.'}`;
    default:
      return `GitHub request failed (HTTP ${status})${apiMessage ? `: ${apiMessage}` : '.'}`;
  }
}

/**
 * Minimal GitHub REST client for the "new issue / milestone" form. It never reads or stores the
 * token beyond the `Authorization` header of the request it makes.
 *
 * @param token - An OAuth token with the `repo` scope.
 * @param repo - Target repository.
 * @param fetchFn - Injectable `fetch`, to ease testing.
 */
export function createGitHubClient(
  token: string,
  repo: GitHubRepo,
  fetchFn: FetchFn = (url, init) => fetch(url, init),
) {
  const base = `${API}/repos/${repo.owner}/${repo.repo}`;

  async function request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`${base}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new GitHubError(`Could not reach GitHub (${reason}). Check your network connection.`);
    }

    if (!response.ok) {
      let apiMessage: string | undefined;
      try {
        const payload = (await response.json()) as {
          message?: string;
          errors?: { message?: string; field?: string; code?: string }[];
        };
        const detail = payload.errors
          ?.map((error) => error.message ?? [error.field, error.code].filter(Boolean).join(' '))
          .filter(Boolean)
          .join('; ');
        apiMessage = [payload.message, detail].filter(Boolean).join(' — ') || undefined;
      } catch {
        // Non-JSON error body: fall back to the status-based message.
      }
      throw new GitHubError(explain(response.status, apiMessage, repo), response.status);
    }

    return (await response.json()) as T;
  }

  return {
    async listOpenMilestones(): Promise<MilestoneSummary[]> {
      const milestones = await request<MilestoneSummary[]>(
        '/milestones?state=open&per_page=100',
        'GET',
      );
      return milestones.map(({ number, title }) => ({ number, title }));
    },

    async listLabels(): Promise<string[]> {
      const labels = await request<{ name: string }[]>('/labels?per_page=100', 'GET');
      return labels.map((label) => label.name);
    },

    async createIssue(payload: {
      title: string;
      body: string;
      labels: string[];
      milestone?: number;
      assignees: string[];
    }): Promise<CreatedResource> {
      const created = await request<{ number: number; html_url: string }>(
        '/issues',
        'POST',
        payload,
      );
      return { number: created.number, url: created.html_url };
    },

    async createMilestone(payload: {
      title: string;
      description?: string;
      due_on?: string;
    }): Promise<CreatedResource> {
      const created = await request<{ number: number; html_url: string }>(
        '/milestones',
        'POST',
        payload,
      );
      return { number: created.number, url: created.html_url };
    },
  };
}
