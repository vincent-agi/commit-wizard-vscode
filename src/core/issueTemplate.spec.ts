import { describe, expect, it } from 'vitest';
import {
  formatIssueTitle,
  milestonePayload,
  parseAssignees,
  renderIssueBody,
  toLines,
  validateIssue,
  validateMilestone,
} from './issueTemplate';
import type { IssueFormInput } from './issueTemplate';

const base: IssueFormInput = { type: 'feat', title: 'add thing', labels: [] };

describe('toLines', () => {
  it('trims, drops blanks and strips list markers and checkboxes', () => {
    expect(toLines('  one\n\n- two\n* three\n- [ ] four\n- [x] five\r\nsix ')).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
    ]);
  });

  it('handles undefined', () => {
    expect(toLines(undefined)).toEqual([]);
  });
});

describe('parseAssignees', () => {
  it('splits on commas and spaces and strips @', () => {
    expect(parseAssignees('@ada, alan  @grace')).toEqual(['ada', 'alan', 'grace']);
    expect(parseAssignees('')).toEqual([]);
  });
});

describe('formatIssueTitle', () => {
  it('formats type, optional scope and title', () => {
    expect(formatIssueTitle({ type: 'feat', title: ' add x ' })).toBe('feat: add x');
    expect(formatIssueTitle({ type: 'fix', scope: 'webview', title: 'y' })).toBe('fix(webview): y');
    expect(formatIssueTitle({ type: 'fix', scope: '  ', title: 'y' })).toBe('fix: y');
  });
});

describe('validateIssue', () => {
  it('requires a type and a title', () => {
    expect(validateIssue(base)).toEqual([]);
    expect(validateIssue({ ...base, title: '  ' })).toEqual(['Enter a title.']);
    expect(validateIssue({ ...base, type: '' })).toEqual(['Pick a type.']);
  });
});

describe('renderIssueBody (standard layout)', () => {
  it('returns an empty body when nothing is filled in', () => {
    expect(renderIssueBody(base)).toBe('');
  });

  it('renders every section in order with bullets and checkboxes', () => {
    expect(
      renderIssueBody({
        ...base,
        context: 'Why.',
        goal: 'What.',
        scopeItems: 'first\nsecond',
        acceptanceCriteria: 'works\ntested',
        notes: 'Careful.',
      }),
    ).toBe(
      [
        '## Context\nWhy.',
        '## Goal\nWhat.',
        '## Scope\n- first\n- second',
        '## Acceptance criteria\n- [ ] works\n- [ ] tested',
        '## Notes\nCareful.',
      ].join('\n\n'),
    );
  });

  it('omits empty sections', () => {
    expect(renderIssueBody({ ...base, goal: 'Only goal.' })).toBe('## Goal\nOnly goal.');
  });
});

describe('renderIssueBody (custom template)', () => {
  const input: IssueFormInput = {
    ...base,
    context: 'Why.',
    acceptanceCriteria: 'works',
  };

  it('replaces placeholders without adding headings', () => {
    expect(
      renderIssueBody(
        input,
        '### Background\n{{context}}\n\n### Done when\n{{acceptanceCriteria}}',
      ),
    ).toBe('### Background\nWhy.\n\n### Done when\n- [ ] works');
  });

  it('can use the title, collapses blank runs from empty placeholders, keeps unknown ones', () => {
    expect(renderIssueBody(input, '# {{title}}\n\n{{goal}}\n\n\n{{unknown}}')).toBe(
      '# add thing\n\n{{unknown}}',
    );
  });
});

describe('milestones', () => {
  it('requires a title and a valid calendar date', () => {
    expect(validateMilestone({ title: 'v1' })).toEqual([]);
    expect(validateMilestone({ title: 'v1', dueOn: '2026-12-31' })).toEqual([]);
    expect(validateMilestone({ title: ' ' })).toEqual(['Enter a title.']);
    expect(validateMilestone({ title: 'v1', dueOn: '31/12/2026' })).toHaveLength(1);
    expect(validateMilestone({ title: 'v1', dueOn: '2026-02-30' })).toHaveLength(1);
  });

  it('builds the API payload, omitting empty fields', () => {
    expect(milestonePayload({ title: ' v1 ' })).toEqual({ title: 'v1' });
    expect(milestonePayload({ title: 'v1', description: ' d ', dueOn: '2026-12-31' })).toEqual({
      title: 'v1',
      description: 'd',
      due_on: '2026-12-31T00:00:00Z',
    });
  });
});
