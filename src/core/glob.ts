const REGEXP_SPECIALS = /[.+^${}()|[\]\\]/g;

/**
 * Converts a glob into an anchored regular expression.
 *
 * Supported: `**` (any path, including `/`), `*` (anything but `/`), `?` (one character but
 * `/`), and `**\/` matching zero or more leading directories. Everything else is literal.
 */
export function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        index++;
        if (glob[index + 1] === '/') {
          index++;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(REGEXP_SPECIALS, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/** Returns whether `value` matches any of `globs`. */
export function matchesAnyGlob(value: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(value));
}
