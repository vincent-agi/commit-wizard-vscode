import type { CommitConfig } from '../core/commitConfig';
import type { IssueFormInput, MilestoneFormInput } from '../core/issueTemplate';

/** Message shape sent from the issue form to the extension host. */
export type IssueFormToHostMessage =
  | { type: 'ready' }
  | { type: 'signIn' }
  | { type: 'submitIssue'; input: IssueFormInput }
  | { type: 'submitMilestone'; input: MilestoneFormInput }
  | { type: 'openUrl'; url: string };

/** Message shape sent from the extension host to the issue form. */
export type HostToIssueFormMessage =
  | {
      type: 'init';
      config: Pick<CommitConfig, 'types' | 'scopes' | 'issueTemplate'>;
      /** `owner/repo`, when the workspace points at a GitHub repository. */
      repo?: string;
    }
  | {
      type: 'meta';
      signedIn: boolean;
      milestones: { number: number; title: string }[];
      labels: string[];
    }
  | { type: 'busy' }
  | { type: 'created'; kind: 'issue' | 'milestone'; number: number; url: string }
  | { type: 'failed'; message: string };
