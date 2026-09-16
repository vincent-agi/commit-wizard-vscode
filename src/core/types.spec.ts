import { describe, expect, it } from 'vitest';
import { COMMIT_TYPE_DESCRIPTIONS, ISSUE_KEYWORD_DESCRIPTIONS, ISSUE_KEYWORD_LABELS } from './types';
import type { CommitType, IssueKeyword } from './types';

const ALL_TYPES: CommitType[] = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'chore',
  'build',
  'ci',
];

const ALL_ISSUE_KEYWORDS: IssueKeyword[] = ['closes', 'fixes', 'resolves', 'refs', 'seeAlso'];

describe('COMMIT_TYPE_DESCRIPTIONS', () => {
  it('has a non-empty description for every commit type', () => {
    for (const type of ALL_TYPES) {
      expect(COMMIT_TYPE_DESCRIPTIONS[type]).toBeTruthy();
    }
  });
});

describe('ISSUE_KEYWORD_LABELS', () => {
  it('has a non-empty label for every issue keyword', () => {
    for (const keyword of ALL_ISSUE_KEYWORDS) {
      expect(ISSUE_KEYWORD_LABELS[keyword]).toBeTruthy();
    }
  });
});

describe('ISSUE_KEYWORD_DESCRIPTIONS', () => {
  it('has a non-empty description for every issue keyword', () => {
    for (const keyword of ALL_ISSUE_KEYWORDS) {
      expect(ISSUE_KEYWORD_DESCRIPTIONS[keyword]).toBeTruthy();
    }
  });
});
