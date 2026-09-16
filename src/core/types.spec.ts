import { describe, expect, it } from 'vitest';
import { COMMIT_TYPE_DESCRIPTIONS, GITMOJI_MAP } from './types';
import type { CommitType } from './types';

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

describe('COMMIT_TYPE_DESCRIPTIONS', () => {
  it('has a non-empty description for every commit type', () => {
    for (const type of ALL_TYPES) {
      expect(COMMIT_TYPE_DESCRIPTIONS[type]).toBeTruthy();
    }
  });
});

describe('GITMOJI_MAP', () => {
  it('has a gitmoji for every commit type', () => {
    for (const type of ALL_TYPES) {
      expect(GITMOJI_MAP[type]).toBeTruthy();
    }
  });
});
