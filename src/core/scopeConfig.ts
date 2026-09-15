/**
 * Returns a new scope list with `newScope` added, trimmed, deduplicated, and
 * sorted alphabetically. Does not mutate `existingScopes`.
 *
 * @param existingScopes - The current scope list.
 * @param newScope - The scope to add.
 * @returns A new, sorted, deduplicated scope list. Unchanged (but still a new array)
 *   when `newScope` is empty after trimming.
 */
export function addScope(existingScopes: readonly string[], newScope: string): string[] {
  const trimmed = newScope.trim();

  if (!trimmed) {
    return [...existingScopes];
  }

  const withoutDuplicate = existingScopes.filter((scope) => scope !== trimmed);
  return [...withoutDuplicate, trimmed].sort((a, b) => a.localeCompare(b));
}
