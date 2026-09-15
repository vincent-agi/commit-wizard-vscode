import { describe, expect, it } from 'vitest';
import { titleLengthStatus } from './titleLength';

describe('titleLengthStatus', () => {
  it('returns "ok" when the title is under the warning threshold', () => {
    expect(titleLengthStatus('short title', 50, 72)).toBe('ok');
  });

  it('returns "ok" exactly at the warning threshold', () => {
    expect(titleLengthStatus('a'.repeat(50), 50, 72)).toBe('ok');
  });

  it('returns "warn" just past the warning threshold', () => {
    expect(titleLengthStatus('a'.repeat(51), 50, 72)).toBe('warn');
  });

  it('returns "warn" exactly at the max threshold', () => {
    expect(titleLengthStatus('a'.repeat(72), 50, 72)).toBe('warn');
  });

  it('returns "over" past the max threshold', () => {
    expect(titleLengthStatus('a'.repeat(73), 50, 72)).toBe('over');
  });
});
