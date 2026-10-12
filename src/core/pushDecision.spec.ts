import { describe, expect, it } from 'vitest';
import { isHeadPushed, planPush } from './pushDecision';

describe('isHeadPushed', () => {
  it('is true only when an upstream exists and nothing is ahead of it', () => {
    const upstream = { remote: 'origin', name: 'main' };
    expect(isHeadPushed({ name: 'main', upstream, ahead: 0 })).toBe(true);
    expect(isHeadPushed({ name: 'main', upstream, ahead: 2 })).toBe(false);
    expect(isHeadPushed({ name: 'main', ahead: 0 })).toBe(false);
    expect(isHeadPushed({ name: 'main', upstream })).toBe(false);
  });
});

describe('planPush', () => {
  it('pushes to the existing upstream without changing tracking', () => {
    expect(
      planPush({ name: 'feat', upstream: { remote: 'fork', name: 'feat' }, ahead: 1 }, ['origin']),
    ).toEqual({ ok: true, remote: 'fork', branch: 'feat', setUpstream: false });
  });

  it('prefers origin and sets the upstream for a new branch', () => {
    expect(planPush({ name: 'feat' }, ['fork', 'origin'])).toEqual({
      ok: true,
      remote: 'origin',
      branch: 'feat',
      setUpstream: true,
    });
  });

  it('falls back to the first remote', () => {
    expect(planPush({ name: 'feat' }, ['fork'])).toMatchObject({ remote: 'fork' });
  });

  it('refuses without a branch or without a remote', () => {
    expect(planPush({}, ['origin'])).toMatchObject({ ok: false });
    expect(planPush({ name: 'feat' }, [])).toMatchObject({ ok: false });
  });
});
