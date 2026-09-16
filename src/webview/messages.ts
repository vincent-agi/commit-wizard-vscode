import type { CommitFormInput } from '../core/types';

/** Message shape sent from the webview client to the extension host. */
export type WebviewToHostMessage =
  | { type: 'formChanged'; input: CommitFormInput }
  | { type: 'addScope' }
  | { type: 'fillCommit'; input: CommitFormInput };

/** Message shape sent from the extension host to the webview client. */
export type HostToWebviewMessage =
  | { type: 'init'; scopes: string[]; detectedIssue?: string }
  | { type: 'scopesUpdated'; scopes: string[] };
