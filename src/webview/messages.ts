import type { ChangeList } from '../core/changes';
import type { CommitFailure } from '../core/commitError';
import type { CommitConfig } from '../core/commitConfig';
import type { DraftFields } from '../core/aiDraft';
import type { CommitFormInput } from '../core/types';

/** Message shape sent from the webview client to the extension host. */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'formChanged'; input: CommitFormInput }
  | { type: 'addScope' }
  | { type: 'commitNow'; input: CommitFormInput; amend: boolean; push: boolean }
  | { type: 'stage'; paths: string[] }
  | { type: 'unstage'; paths: string[] }
  | { type: 'stageAll' }
  | { type: 'unstageAll' }
  | { type: 'setAmend'; amend: boolean }
  | { type: 'draftWithAi' }
  | { type: 'clearDraft' }
  | { type: 'newBranch' }
  | { type: 'openUrl'; url: string }
  | { type: 'lookupIssues'; references: string[] };

/** Everything that depends on the current repository and branch. */
export interface RepositoryState {
  branch?: string;
  /** Issue detected from the branch name, to prefill the issue field. */
  detectedIssue?: string;
  /** Saved draft for this branch, if any. */
  draft?: CommitFormInput;
  /** Messages of the latest commits, newest first. */
  recent: string[];
  changes: ChangeList;
  /** URL with an `{id}` placeholder linking issue references, when a tracker is configured. */
  issueUrlTemplate?: string;
}

/** Message shape sent from the extension host to the webview client. */
export type HostToWebviewMessage =
  | ({ type: 'init'; config: CommitConfig; warnings: string[] } & RepositoryState)
  | { type: 'configUpdated'; config: CommitConfig; warnings: string[] }
  | ({ type: 'branchChanged' } & RepositoryState)
  | { type: 'changes'; changes: ChangeList }
  | { type: 'commitStarted' }
  | { type: 'commitSucceeded'; recent: string[] }
  | { type: 'commitFailed'; failure: CommitFailure }
  | { type: 'prefill'; input: CommitFormInput }
  | { type: 'aiResult'; draft: DraftFields }
  | { type: 'aiFailed'; message: string }
  | { type: 'issueTitles'; titles: Record<string, string> };
