import { t } from '../i18n';
/** What the amend and push logic needs to know about the current branch. */
export interface HeadInfo {
  /** Branch name; `undefined` for a detached HEAD. */
  name?: string;
  upstream?: { remote: string; name: string };
  /** Number of local commits not yet on the upstream. */
  ahead?: number;
}

/**
 * Whether the latest commit is already on the upstream, which makes amending it a history
 * rewrite for everybody else. A branch without upstream has nothing published.
 */
export function isHeadPushed(head: HeadInfo): boolean {
  return head.upstream !== undefined && head.ahead === 0;
}

export type PushPlan =
  | { ok: true; remote: string; branch: string; setUpstream: boolean }
  | { ok: false; reason: string };

/**
 * Decides where to push the current branch: its upstream when it has one, otherwise `origin`
 * (or the only/first remote) with upstream tracking set.
 */
export function planPush(head: HeadInfo, remotes: readonly string[]): PushPlan {
  if (!head.name) {
    return { ok: false, reason: t('push.detached') };
  }
  if (head.upstream) {
    return { ok: true, remote: head.upstream.remote, branch: head.name, setUpstream: false };
  }
  const remote = remotes.includes('origin') ? 'origin' : remotes[0];
  if (!remote) {
    return { ok: false, reason: t('push.noRemote') };
  }
  return { ok: true, remote, branch: head.name, setUpstream: true };
}
