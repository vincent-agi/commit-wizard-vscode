/** Classification of a commit title's length relative to configured thresholds. */
export type TitleLengthStatus = 'ok' | 'warn' | 'over';

/**
 * Classifies a commit title's length for the character-counter's visual state.
 *
 * @param title - The commit title text.
 * @param warnAt - Length at which the status becomes `'warn'` (inclusive).
 * @param maxAt - Length at which the status becomes `'over'` (exclusive of `'warn'`).
 * @returns `'ok'` at or under `warnAt`, `'warn'` between `warnAt` (exclusive) and `maxAt`
 *   (inclusive), `'over'` beyond `maxAt`.
 */
export function titleLengthStatus(title: string, warnAt: number, maxAt: number): TitleLengthStatus {
  const length = title.length;

  if (length <= warnAt) {
    return 'ok';
  }

  if (length <= maxAt) {
    return 'warn';
  }

  return 'over';
}
