import { describe, expect, it } from 'vitest';
import { GITMOJI_CATALOG } from './gitmoji';
import { GITMOJI_MAP } from './types';

describe('GITMOJI_CATALOG', () => {
  it('has a substantial number of entries', () => {
    expect(GITMOJI_CATALOG.length).toBeGreaterThanOrEqual(70);
  });

  it('has a non-empty emoji, code, and description for every entry', () => {
    for (const entry of GITMOJI_CATALOG) {
      expect(entry.emoji).toBeTruthy();
      expect(entry.code).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it('uses a :snake_case: code for every entry', () => {
    for (const entry of GITMOJI_CATALOG) {
      expect(entry.code).toMatch(/^:[a-z0-9_-]+:$/);
    }
  });

  it('has no duplicate codes', () => {
    const codes = GITMOJI_CATALOG.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('contains every default gitmoji used by GITMOJI_MAP', () => {
    const catalogEmojis = new Set(GITMOJI_CATALOG.map((entry) => entry.emoji));
    for (const emoji of Object.values(GITMOJI_MAP)) {
      expect(catalogEmojis.has(emoji)).toBe(true);
    }
  });
});
