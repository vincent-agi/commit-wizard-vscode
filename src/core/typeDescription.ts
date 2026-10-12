import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { COMMIT_TYPE_DESCRIPTIONS } from './types';
import type { DefaultCommitType } from './types';

/**
 * The description to show for a commit type. The ten built-in types keep their English text in
 * the configuration (so it can be compared and overridden); when a type still carries exactly
 * that text it is shown translated, while a team's own wording is shown as written.
 */
export function localizedTypeDescription(name: string, description: string): string {
  const builtin = COMMIT_TYPE_DESCRIPTIONS[name as DefaultCommitType];
  return builtin !== undefined && builtin === description
    ? t(`type.${name}` as MessageKey)
    : description;
}
