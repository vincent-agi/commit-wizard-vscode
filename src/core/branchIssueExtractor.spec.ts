import { describe, expect, it } from 'vitest';
import { extractIssueFromBranch } from './branchIssueExtractor';

describe('extractIssueFromBranch', () => {
  it('extracts a Jira-style project key with number', () => {
    expect(extractIssueFromBranch('feature/issue-123-login')).toBe('#123');
  });

  it('extracts a Jira-style key regardless of surrounding words', () => {
    expect(extractIssueFromBranch('ABC12-7-fix-crash-on-startup')).toBe('ABC12-7');
  });

  it('extracts an explicit #number token', () => {
    expect(extractIssueFromBranch('hotfix/#456-null-pointer')).toBe('#456');
  });

  it('extracts a bare number following "issue"', () => {
    expect(extractIssueFromBranch('issue-456-null-pointer')).toBe('#456');
  });

  it('extracts a bare number following "gh" case-insensitively', () => {
    expect(extractIssueFromBranch('GH-789-typo')).toBe('#789');
  });

  it('returns undefined for branch names with no ticket-like token', () => {
    expect(extractIssueFromBranch('main')).toBeUndefined();
    expect(extractIssueFromBranch('develop')).toBeUndefined();
    expect(extractIssueFromBranch('feature/improve-docs')).toBeUndefined();
  });

  it('returns undefined for an empty branch name', () => {
    expect(extractIssueFromBranch('')).toBeUndefined();
  });

  it('prefers the Jira-style match over a bare number when both are present', () => {
    expect(extractIssueFromBranch('feature/123-fixes-issue-456')).toBe('#456');
  });

  it('uses the first capture group of a custom issue pattern', () => {
    expect(extractIssueFromBranch('team/ENG_42-login', '(ENG_\\d+)')).toBe('ENG_42');
  });

  it('returns the whole match when the custom pattern has no capture group', () => {
    expect(extractIssueFromBranch('team/ENG42-login', 'ENG\\d+')).toBe('ENG42');
  });

  it('falls back to built-in detection when the custom pattern does not match', () => {
    expect(extractIssueFromBranch('feature/issue-123-login', 'ENG_\\d+')).toBe('#123');
  });

  it('ignores an invalid custom pattern', () => {
    expect(extractIssueFromBranch('feature/issue-123-login', '(')).toBe('#123');
  });
});
