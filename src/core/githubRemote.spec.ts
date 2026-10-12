import { describe, expect, it } from 'vitest';
import { parseGitHubRemote } from './githubRemote';

describe('parseGitHubRemote', () => {
  it.each([
    'git@github.com:vincent-agi/commit-wizard-vscode.git',
    'git@github.com:vincent-agi/commit-wizard-vscode',
    'https://github.com/vincent-agi/commit-wizard-vscode.git',
    'https://github.com/vincent-agi/commit-wizard-vscode',
    'https://github.com/vincent-agi/commit-wizard-vscode/',
    'https://user:token@github.com/vincent-agi/commit-wizard-vscode.git',
    'ssh://git@github.com/vincent-agi/commit-wizard-vscode.git',
    'ssh://git@github.com:22/vincent-agi/commit-wizard-vscode.git',
  ])('parses %s', (url) => {
    expect(parseGitHubRemote(url)).toEqual({
      owner: 'vincent-agi',
      repo: 'commit-wizard-vscode',
    });
  });

  it('keeps dots inside the repository name', () => {
    expect(parseGitHubRemote('git@github.com:o/my.repo.git')).toEqual({
      owner: 'o',
      repo: 'my.repo',
    });
  });

  it.each([
    'git@gitlab.com:o/r.git',
    'https://example.com/o/r.git',
    'https://github.com/only-owner',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(parseGitHubRemote(url)).toBeUndefined();
  });
});
