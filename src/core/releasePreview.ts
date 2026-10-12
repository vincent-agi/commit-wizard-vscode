import { parseCommitMessage } from './parseCommit';

export type Bump = 'major' | 'minor' | 'patch' | 'none';

/** Release Please options that change how versions are bumped. */
export interface BumpOptions {
  /** Breaking changes bump the minor version while the major version is 0. */
  bumpMinorPreMajor: boolean;
  /** Features bump the patch version while the major version is 0. */
  bumpPatchForMinorPreMajor: boolean;
}

export interface PreviewCommit {
  hash: string;
  message: string;
}

export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ReleasePreview {
  currentVersion: string;
  nextVersion: string | undefined;
  bump: Bump;
  /** Changelog sections Release Please would write, in its order. */
  sections: ChangelogSection[];
  /** Conventional commits that do not appear in the changelog (`docs`, `chore`, ...). */
  hidden: PreviewCommit[];
  /** Commits Release Please cannot read: not Conventional Commits, or emoji before the type. */
  invisible: PreviewCommit[];
}

const SECTIONS: readonly { type: string; heading: string }[] = [
  { type: 'feat', heading: 'Features' },
  { type: 'fix', heading: 'Bug Fixes' },
  { type: 'perf', heading: 'Performance Improvements' },
  { type: 'revert', heading: 'Reverts' },
];

/** Release Please only reads headers that start with the type: no emoji before it. */
const RELEASE_PLEASE_HEADER = /^[A-Za-z][\w-]*(?:\([^)]*\))?!?: \S/;

export const DEFAULT_BUMP_OPTIONS: BumpOptions = {
  bumpMinorPreMajor: false,
  bumpPatchForMinorPreMajor: false,
};

/**
 * Reads the bump options from a parsed `release-please-config.json`, at the top level or on the
 * root package (`packages["."]`), the latter taking precedence.
 */
export function parseBumpOptions(config: unknown): BumpOptions {
  const read = (source: unknown, key: string): boolean | undefined => {
    if (typeof source !== 'object' || source === null) return undefined;
    const value = (source as Record<string, unknown>)[key];
    return typeof value === 'boolean' ? value : undefined;
  };
  const root =
    typeof config === 'object' && config !== null
      ? ((config as Record<string, unknown>).packages as Record<string, unknown> | undefined)?.['.']
      : undefined;
  return {
    bumpMinorPreMajor:
      read(root, 'bump-minor-pre-major') ?? read(config, 'bump-minor-pre-major') ?? false,
    bumpPatchForMinorPreMajor:
      read(root, 'bump-patch-for-minor-pre-major') ??
      read(config, 'bump-patch-for-minor-pre-major') ??
      false,
  };
}

/** Increments `version` (`MAJOR.MINOR.PATCH`, pre-release suffixes dropped) by `bump`. */
export function bumpVersion(version: string, bump: Bump): string | undefined {
  const match = version
    .trim()
    .replace(/^v/, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  const [major, minor, patch] = match.slice(1).map(Number);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return undefined;
  }
}

/**
 * Computes what Release Please would propose from the unreleased commits: the bump, the next
 * version and the changelog, following its default rules (`feat` -> minor, `fix`/`perf` ->
 * patch, breaking -> major) and the `bump-*-pre-major` options for 0.x versions.
 *
 * @param commits - Commits since the last release, newest first.
 * @param currentVersion - The released version (from the manifest or the last tag).
 */
export function previewRelease(
  commits: readonly PreviewCommit[],
  currentVersion: string,
  options: BumpOptions = DEFAULT_BUMP_OPTIONS,
): ReleasePreview {
  const sections = new Map<string, string[]>();
  const hidden: PreviewCommit[] = [];
  const invisible: PreviewCommit[] = [];
  const breakingNotes: string[] = [];
  let hasBreaking = false;
  let hasFeature = false;
  let hasFix = false;

  for (const commit of [...commits].reverse()) {
    const header = commit.message.split('\n')[0].trim();
    const parsed = parseCommitMessage(commit.message);
    if (!parsed || !RELEASE_PLEASE_HEADER.test(header)) {
      invisible.push(commit);
      continue;
    }

    const scope = parsed.scope ? `**${parsed.scope}:** ` : '';
    const entry = `${scope}${parsed.description} (${commit.hash.slice(0, 7)})`;
    const section = SECTIONS.find((candidate) => candidate.type === parsed.type);

    if (parsed.breaking) {
      hasBreaking = true;
      breakingNotes.push(parsed.breakingChangeDescription ?? parsed.description);
    }
    if (section) {
      sections.set(section.heading, [...(sections.get(section.heading) ?? []), entry]);
      if (parsed.type === 'feat') hasFeature = true;
      else hasFix = true;
    } else if (!parsed.breaking) {
      hidden.push(commit);
    }
  }

  const preMajor = currentVersion.trim().replace(/^v/, '').startsWith('0.');
  let bump: Bump = 'none';
  if (hasBreaking) {
    bump = preMajor && options.bumpMinorPreMajor ? 'minor' : 'major';
  } else if (hasFeature) {
    bump = preMajor && options.bumpPatchForMinorPreMajor ? 'patch' : 'minor';
  } else if (hasFix) {
    bump = 'patch';
  }

  const ordered: ChangelogSection[] = [];
  if (breakingNotes.length > 0) {
    ordered.push({ heading: '⚠ BREAKING CHANGES', items: breakingNotes });
  }
  for (const { heading } of SECTIONS) {
    const items = sections.get(heading);
    if (items) ordered.push({ heading, items });
  }

  return {
    currentVersion,
    nextVersion: bumpVersion(currentVersion, bump),
    bump,
    sections: ordered,
    hidden,
    invisible,
  };
}
