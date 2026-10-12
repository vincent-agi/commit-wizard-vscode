import { describe, expect, it } from 'vitest';
import { toChangeList } from './changes';

describe('toChangeList', () => {
  it('maps Git statuses to letters and sorts by path', () => {
    expect(
      toChangeList(
        [
          { path: 'b.ts', status: 1 },
          { path: 'a.ts', status: 0 },
          { path: 'c.ts', status: 3 },
        ],
        [
          { path: 'z.md', status: 7 },
          { path: 'y.md', status: 6 },
        ],
      ),
    ).toEqual({
      staged: [
        { path: 'a.ts', status: 'M' },
        { path: 'b.ts', status: 'A' },
        { path: 'c.ts', status: 'R' },
      ],
      unstaged: [
        { path: 'y.md', status: 'D' },
        { path: 'z.md', status: 'U' },
      ],
    });
  });

  it('uses "?" for statuses it does not know (conflicts, ignored)', () => {
    expect(toChangeList([], [{ path: 'x', status: 8 }]).unstaged[0].status).toBe('?');
  });

  it('returns empty lists when nothing changed', () => {
    expect(toChangeList([], [])).toEqual({ staged: [], unstaged: [] });
  });

  it('keeps a file changed in both the index and the working tree in both lists', () => {
    const list = toChangeList([{ path: 'a', status: 0 }], [{ path: 'a', status: 5 }]);
    expect(list.staged).toHaveLength(1);
    expect(list.unstaged).toHaveLength(1);
  });
});
