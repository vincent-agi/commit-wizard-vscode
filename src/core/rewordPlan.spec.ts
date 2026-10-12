import { describe, expect, it } from 'vitest';
import { planReword, rebaseCommand } from './rewordPlan';

describe('planReword', () => {
  it('amends an unpublished HEAD directly', () => {
    expect(planReword({ isHead: true, pushed: false })).toBe('amend');
  });

  it('asks for confirmation when HEAD is already pushed', () => {
    expect(planReword({ isHead: true, pushed: true })).toBe('confirm-pushed');
  });

  it('only gives guidance for older commits, pushed or not', () => {
    expect(planReword({ isHead: false, pushed: false })).toBe('rebase-guidance');
    expect(planReword({ isHead: false, pushed: true })).toBe('rebase-guidance');
  });
});

describe('rebaseCommand', () => {
  it('counts the commit itself', () => {
    expect(rebaseCommand(0)).toBe('git rebase -i HEAD~1');
    expect(rebaseCommand(3)).toBe('git rebase -i HEAD~4');
  });
});
