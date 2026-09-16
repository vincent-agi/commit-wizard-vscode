import { describe, expect, it } from 'vitest';
import { GITMOJI_CATALOG } from './gitmoji';

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
});
