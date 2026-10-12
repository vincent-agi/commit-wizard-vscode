import { matchesAnyGlob } from './glob';

/** Whether `branch` matches one of the protected names or globs. Detached HEAD is never protected. */
export function isProtectedBranch(
  branch: string | undefined,
  patterns: readonly string[],
): boolean {
  return branch !== undefined && matchesAnyGlob(branch, patterns);
}
