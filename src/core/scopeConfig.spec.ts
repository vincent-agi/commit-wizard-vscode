import { describe, expect, it } from 'vitest';
import { addScope } from './scopeConfig';
import type { Scope } from './types';

const webview: Scope = { name: 'webview', description: 'Webview UI and client script' };
const ci: Scope = { name: 'ci', description: 'Continuous integration' };

describe('addScope', () => {
  it('appends a new scope and sorts alphabetically by name', () => {
    expect(addScope([ci, webview], { name: 'parser', description: 'Commit parsing' })).toEqual([
      ci,
      { name: 'parser', description: 'Commit parsing' },
      webview,
    ]);
  });

  it('trims whitespace around the name and description', () => {
    expect(addScope([], { name: '  parser  ', description: '  Commit parsing  ' })).toEqual([
      { name: 'parser', description: 'Commit parsing' },
    ]);
  });

  it('replaces the description of an existing scope with the same name instead of duplicating it', () => {
    expect(
      addScope([webview], { name: 'webview', description: 'Updated description' }),
    ).toEqual([{ name: 'webview', description: 'Updated description' }]);
  });

  it('rejects an empty or whitespace-only name, returning the list unchanged', () => {
    expect(addScope([webview], { name: '', description: 'Some description' })).toEqual([
      webview,
    ]);
    expect(addScope([webview], { name: '   ', description: 'Some description' })).toEqual([
      webview,
    ]);
  });

  it('rejects an empty or whitespace-only description, returning the list unchanged', () => {
    expect(addScope([webview], { name: 'parser', description: '' })).toEqual([webview]);
    expect(addScope([webview], { name: 'parser', description: '   ' })).toEqual([webview]);
  });

  it('does not mutate the input array', () => {
    const original = [ci];
    addScope(original, webview);
    expect(original).toEqual([ci]);
  });

  it('starts from an empty list', () => {
    expect(addScope([], webview)).toEqual([webview]);
  });
});
