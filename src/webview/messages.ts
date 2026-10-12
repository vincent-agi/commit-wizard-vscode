import type { CommitFailure } from '../core/commitError';
import type { CommitConfig } from '../core/commitConfig';
import type { CommitFormInput } from '../core/types';

/** Message shape sent from the webview client to the extension host. */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'formChanged'; input: CommitFormInput }
  | { type: 'addScope' }
  | { type: 'commitNow'; input: CommitFormInput };

/** Message shape sent from the extension host to the webview client. */
export type HostToWebviewMessage =
  | { type: 'init'; config: CommitConfig; warnings: string[]; detectedIssue?: string }
  | { type: 'configUpdated'; config: CommitConfig; warnings: string[] }
  | { type: 'commitStarted' }
  | { type: 'commitSucceeded' }
  | { type: 'commitFailed'; failure: CommitFailure };
