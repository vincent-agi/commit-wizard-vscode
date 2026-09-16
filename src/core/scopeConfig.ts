import type { Scope } from './types';

/**
 * Returns a new scope list with `newScope` added, trimmed, sorted alphabetically by name.
 * Both `name` and `description` are required (mandatory) — the list is returned unchanged
 * (but as a new array) when either is empty after trimming. Adding a scope whose name already
 * exists replaces that entry's description rather than creating a duplicate. Does not mutate
 * `existingScopes`.
 *
 * @param existingScopes - The current scope list.
 * @param newScope - The scope to add or update.
 * @returns A new, sorted scope list.
 */
export function addScope(existingScopes: readonly Scope[], newScope: Scope): Scope[] {
  const name = newScope.name.trim();
  const description = newScope.description.trim();

  if (!name || !description) {
    return [...existingScopes];
  }

  const withoutDuplicate = existingScopes.filter((scope) => scope.name !== name);
  return [...withoutDuplicate, { name, description }].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
