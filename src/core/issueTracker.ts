import type { GitHubRepo } from './githubRemote';

/** Issue trackers with ready-made detection and link settings. */
export type IssueTrackerPreset = 'jira' | 'linear' | 'github';

export interface IssueTrackerConfig {
  preset: IssueTrackerPreset;
  /** Root URL of the tracker, e.g. `https://example.atlassian.net`. Needed for Jira and Linear. */
  baseUrl?: string;
}

export const ISSUE_TRACKER_PRESETS: readonly IssueTrackerPreset[] = ['jira', 'linear', 'github'];

/** What the issue field uses to detect and link a ticket. */
export interface ResolvedTracker {
  /** Regular expression source for the branch name; `undefined` keeps the built-in detection. */
  pattern?: string;
  /** URL with an `{id}` placeholder; `undefined` when issues cannot be linked. */
  urlTemplate?: string;
}

const KEY_PATTERN = '\\b([A-Z][A-Z0-9]+-\\d+)\\b';

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Combines the tracker preset with explicit overrides: an explicit `issuePattern` or
 * `issueUrlTemplate` always wins over what the preset would provide.
 *
 * @param github - The workspace's GitHub repository, used for the `github` preset.
 */
export function resolveTracker(
  options: {
    tracker?: IssueTrackerConfig;
    issuePattern?: string;
    issueUrlTemplate?: string;
  },
  github?: GitHubRepo,
): ResolvedTracker {
  let preset: ResolvedTracker = {};
  const { tracker } = options;

  if (tracker?.preset === 'jira' || tracker?.preset === 'linear') {
    preset = {
      pattern: KEY_PATTERN,
      urlTemplate: tracker.baseUrl
        ? `${trimSlash(tracker.baseUrl)}/${tracker.preset === 'jira' ? 'browse' : 'issue'}/{id}`
        : undefined,
    };
  } else if (tracker?.preset === 'github' && github) {
    preset = {
      urlTemplate: `https://github.com/${github.owner}/${github.repo}/issues/{id}`,
    };
  }

  return {
    pattern: options.issuePattern ?? preset.pattern,
    urlTemplate: options.issueUrlTemplate ?? preset.urlTemplate,
  };
}

/** A reference typed in the issue field, split from its link. */
export interface IssueLink {
  /** The reference as typed (`#12`, `PROJ-3`). */
  label: string;
  url: string;
}

/**
 * Turns the issue field (several references separated by spaces or commas) into links using
 * `urlTemplate`, whose `{id}` receives the reference without a leading `#`. Only `http(s)` URLs
 * are produced.
 */
export function buildIssueLinks(field: string | undefined, urlTemplate?: string): IssueLink[] {
  if (!urlTemplate) {
    return [];
  }
  const links: IssueLink[] = [];
  for (const label of (field ?? '').split(/[\s,]+/).filter(Boolean)) {
    const url = urlTemplate.replace('{id}', encodeURIComponent(label.replace(/^#/, '')));
    if (/^https?:\/\//i.test(url)) {
      links.push({ label, url });
    }
  }
  return links;
}

/** The issue number of a GitHub-style reference (`12`, `#12`), or `undefined` for other keys. */
export function githubIssueNumber(reference: string): number | undefined {
  const match = reference.trim().match(/^#?(\d+)$/);
  return match ? Number(match[1]) : undefined;
}
