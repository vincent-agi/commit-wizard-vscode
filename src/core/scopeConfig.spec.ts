import { describe, expect, it } from 'vitest';
import { addScope } from './scopeConfig';

describe('addScope', () => {
  it('appends a new scope and sorts alphabetically', () => {
    expect(addScope(['ci', 'webview'], 'parser')).toEqual(['ci', 'parser', 'webview']);
  });

  it('trims whitespace around the new scope', () => {
    expect(addScope([], '  parser  ')).toEqual(['parser']);
  });

  it('does not duplicate an existing scope', () => {
    expect(addScope(['parser', 'webview'], 'parser')).toEqual(['parser', 'webview']);
  });

  it('rejects an empty or whitespace-only scope, returning the list unchanged', () => {
    expect(addScope(['parser'], '')).toEqual(['parser']);
    expect(addScope(['parser'], '   ')).toEqual(['parser']);
  });

  it('does not mutate the input array', () => {
    const original = ['ci'];
    addScope(original, 'webview');
    expect(original).toEqual(['ci']);
  });

  it('starts from an empty list', () => {
    expect(addScope([], 'webview')).toEqual(['webview']);
  });
});
