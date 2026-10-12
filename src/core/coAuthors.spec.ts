import { describe, expect, it } from 'vitest';
import { parseCoAuthors } from './coAuthors';

describe('parseCoAuthors', () => {
  it('returns nothing for empty or undefined input', () => {
    expect(parseCoAuthors(undefined)).toEqual({ valid: [], invalid: [] });
    expect(parseCoAuthors('  \n \n')).toEqual({ valid: [], invalid: [] });
  });

  it('accepts one "Name <email>" entry per line and trims them', () => {
    expect(
      parseCoAuthors('  Ada Lovelace <ada@example.com>  \nAlan Turing <alan@example.com>'),
    ).toEqual({
      valid: ['Ada Lovelace <ada@example.com>', 'Alan Turing <alan@example.com>'],
      invalid: [],
    });
  });

  it('flags entries without a name, an email, or angle brackets', () => {
    expect(parseCoAuthors('ada@example.com\n<ada@example.com>\nAda <not-an-email>\nAda')).toEqual({
      valid: [],
      invalid: ['ada@example.com', '<ada@example.com>', 'Ada <not-an-email>', 'Ada'],
    });
  });

  it('splits valid and invalid entries and drops duplicates', () => {
    expect(parseCoAuthors('Ada <ada@example.com>\nbroken\nAda <ada@example.com>')).toEqual({
      valid: ['Ada <ada@example.com>'],
      invalid: ['broken'],
    });
  });

  it('handles CRLF line endings', () => {
    expect(parseCoAuthors('Ada <ada@example.com>\r\nAlan <alan@example.com>').valid).toHaveLength(
      2,
    );
  });
});
