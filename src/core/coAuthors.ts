const CO_AUTHOR = /^[^<>\r\n]+\s<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/;

/** Result of parsing the Co-authored-by textarea. */
export interface ParsedCoAuthors {
  /** Entries in valid `Name <email>` form, trimmed. */
  valid: string[];
  /** Non-empty entries that do not match `Name <email>`. */
  invalid: string[];
}

/**
 * Parses one `Name <email>` entry per line, ignoring blank lines and duplicates.
 *
 * @param text - Raw content of the Co-authored-by textarea.
 */
export function parseCoAuthors(text: string | undefined): ParsedCoAuthors {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const line of (text ?? '').split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry) {
      continue;
    }
    if (!CO_AUTHOR.test(entry)) {
      invalid.push(entry);
    } else if (!valid.includes(entry)) {
      valid.push(entry);
    }
  }

  return { valid, invalid };
}
