import { describe, expect, it } from 'vitest';
import { TELEMETRY_EVENTS, sanitizeEvent } from './telemetryEvents';

describe('sanitizeEvent', () => {
  it('keeps whitelisted properties with safe values', () => {
    expect(
      sanitizeEvent('commit', { typeKind: 'builtin', amend: false, push: true, aiDraft: false }),
    ).toEqual({
      name: 'commit',
      properties: { typeKind: 'builtin', amend: false, push: true, aiDraft: false },
    });
  });

  it('rejects unknown events, including inherited object keys', () => {
    expect(sanitizeEvent('clicked', {})).toBeUndefined();
    expect(sanitizeEvent('toString', {})).toBeUndefined();
    expect(sanitizeEvent('__proto__', {})).toBeUndefined();
  });

  it('drops properties that are not whitelisted for the event', () => {
    expect(
      sanitizeEvent('commit', { typeKind: 'custom', message: 'fix: secret' })?.properties,
    ).toEqual({
      typeKind: 'custom',
    });
    expect(sanitizeEvent('command', { typeKind: 'custom' })?.properties).toEqual({});
  });

  it('drops free text: spaces, uppercase, paths, long strings, objects', () => {
    const unsafe = [
      'fix: leak the key',
      'Secret',
      '/Users/someone/project',
      'a'.repeat(41),
      '',
      'user@example.com',
      { nested: true },
      null,
      undefined,
    ];
    for (const value of unsafe) {
      expect(sanitizeEvent('command', { name: value })?.properties).toEqual({});
    }
  });

  it('accepts comma separated tokens and small numbers', () => {
    expect(
      sanitizeEvent('hooksInstalled', { manager: 'husky', presets: 'lint,test-run' })?.properties,
    ).toEqual({
      manager: 'husky',
      presets: 'lint,test-run',
    });
  });

  it('rejects non-finite or huge numbers', () => {
    expect(sanitizeEvent('commit', { typeKind: Infinity })?.properties).toEqual({});
    expect(sanitizeEvent('commit', { typeKind: 10 ** 9 })?.properties).toEqual({});
  });
});

describe('TELEMETRY_EVENTS', () => {
  it('lists no property that sounds like free text', () => {
    const names = Object.values(TELEMETRY_EVENTS).flat();
    for (const name of names) {
      expect(name).not.toMatch(/message|path|repo|branch|user|email|file|text|body|description/i);
    }
  });
});
