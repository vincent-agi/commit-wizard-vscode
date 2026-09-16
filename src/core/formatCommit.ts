import { GITMOJI_MAP } from './types';
import type { CommitFormInput } from './types';

/**
 * Builds a Conventional Commits message, prefixed with the Gitmoji matching
 * `input.type`, from a {@link CommitFormInput}.
 *
 * @param input - Values collected from the commit builder form.
 * @returns The formatted commit message, ready to write into a Git commit input box.
 */
export function formatCommitMessage(input: CommitFormInput): string {
  const gitmoji = GITMOJI_MAP[input.type];
  const scope = input.scope?.trim();
  const issue = input.issue?.trim();
  let body = input.body?.trim();
  const breakingChangeDescription = input.breakingChangeDescription?.trim();

  const scopePart = scope ? `(${scope})` : '';
  const issuePart = issue ? `${issue} ` : '';
  const title = `${gitmoji} ${input.type}${scopePart}: ${input.description}`;

  const paragraphs = [title];

  body = `${body ?? ''} ${issuePart}`;
  paragraphs.push(body);

  if (input.breakingChange && breakingChangeDescription) {
    paragraphs.push(`BREAKING CHANGE: ${breakingChangeDescription}`);
  }

  return paragraphs.join('\n\n');
}
