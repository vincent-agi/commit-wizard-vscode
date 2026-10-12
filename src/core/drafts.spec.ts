import { describe, expect, it } from 'vitest';
import { clearDraft, draftKey, isEmptyDraft, loadDraft, sanitizeDraft, saveDraft } from './drafts';
import type { DraftStorage } from './drafts';
import type { CommitFormInput } from './types';

const base: CommitFormInput = {
  type: 'feat',
  gitmoji: '✨',
  issueKeyword: 'refs',
  description: '',
  breakingChange: false,
};

function memory(): DraftStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: <T>(key: string) => data.get(key) as T | undefined,
    update: async (key, value) => {
      if (value === undefined) data.delete(key);
      else data.set(key, value);
    },
  };
}

describe('draftKey', () => {
  it('is distinct per repository and per branch', () => {
    expect(draftKey('/a', 'main')).not.toBe(draftKey('/b', 'main'));
    expect(draftKey('/a', 'main')).not.toBe(draftKey('/a', 'dev'));
  });
});

describe('isEmptyDraft', () => {
  it('ignores dropdown choices alone', () => {
    expect(isEmptyDraft({ ...base, scope: 'core', type: 'fix' })).toBe(true);
  });

  it.each([
    { description: 'x' },
    { body: 'x' },
    { issue: '1' },
    { breakingChange: true },
    { breakingChangeDescription: 'x' },
    { coAuthors: ['A <a@b.co>'] },
  ])('is not empty once %j is set', (patch) => {
    expect(isEmptyDraft({ ...base, ...patch })).toBe(false);
  });
});

describe('sanitizeDraft', () => {
  it('rejects non objects and objects missing required fields', () => {
    for (const raw of [undefined, null, 'x', 3, {}, { type: 'feat' }, { description: 'x' }]) {
      expect(sanitizeDraft(raw)).toBeUndefined();
    }
  });

  it('repairs malformed optional fields', () => {
    expect(
      sanitizeDraft({
        type: 'feat',
        description: 'x',
        gitmoji: 5,
        issueKeyword: 'bogus',
        coAuthors: ['ok', 3, null],
        breakingChange: 'yes',
      }),
    ).toMatchObject({
      gitmoji: '',
      issueKeyword: 'refs',
      coAuthors: ['ok'],
      breakingChange: false,
    });
  });
});

describe('draft storage', () => {
  it('saves, loads and clears a draft', async () => {
    const storage = memory();
    const key = draftKey('/repo', 'feature');
    await saveDraft(storage, key, { ...base, description: 'wip' });
    expect(loadDraft(storage, key)?.description).toBe('wip');
    await clearDraft(storage, key);
    expect(loadDraft(storage, key)).toBeUndefined();
  });

  it('removes the stored draft when the form becomes empty', async () => {
    const storage = memory();
    const key = draftKey('/repo', 'feature');
    await saveDraft(storage, key, { ...base, description: 'wip' });
    await saveDraft(storage, key, base);
    expect(storage.data.has(key)).toBe(false);
  });

  it('keeps drafts of different branches apart', async () => {
    const storage = memory();
    await saveDraft(storage, draftKey('/r', 'a'), { ...base, description: 'A' });
    await saveDraft(storage, draftKey('/r', 'b'), { ...base, description: 'B' });
    expect(loadDraft(storage, draftKey('/r', 'a'))?.description).toBe('A');
    expect(loadDraft(storage, draftKey('/r', 'b'))?.description).toBe('B');
  });

  it('ignores corrupted stored data', () => {
    const storage = memory();
    storage.data.set('k', { nonsense: true });
    expect(loadDraft(storage, 'k')).toBeUndefined();
  });
});
