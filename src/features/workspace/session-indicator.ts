import type { SessionSummary } from '../../../shared/types.ts'
import { isAgentSelector, isBlockingDialog } from '../dialogs/dialog-protocol.ts'

export type SessionIndicator = 'working' | 'waiting' | 'compacting' | 'complete' | 'idle'

/** Returns the highest-priority state to surface beside a live Pi session. */
export function sessionIndicator(
  session: SessionSummary | undefined,
  selectedId: string,
  compactingSessionIds: ReadonlySet<string>,
  completedSessionIds: ReadonlySet<string>,
): SessionIndicator | null {
  if (!session) return null
  if (session.pendingUi.some((request) => isBlockingDialog(request) && !isAgentSelector(request)))
    return 'waiting'
  if (compactingSessionIds.has(session.id)) return 'compacting'
  if (session.status === 'starting' || session.status === 'running') return 'working'
  if (
    session.status === 'idle' && session.id !== selectedId
    && completedSessionIds.has(session.sessionPath ?? session.id)
  ) return 'complete'
  if (session.status === 'idle') return 'idle'
  return null
}

/**
 * Whether a session other than the selected one still needs attention, mirroring the `complete`
 * branch of {@link sessionIndicator}. The tab badge uses it so the session on screen never stays
 * marked, even when a restored marker still names it.
 */
export function hasUnseenCompletion(
  sessions: readonly SessionSummary[],
  selectedId: string,
  completedSessionIds: ReadonlySet<string>,
): boolean {
  return sessions.some((session) =>
    session.id !== selectedId && completedSessionIds.has(session.sessionPath ?? session.id)
  )
}
