import type { SessionSummary } from '../../../shared/types.ts'
import type { WorkspaceGroup } from './workspace-groups.ts'

/** Everything needed to rename, pin, or close a row from the sidebar. */
export interface SessionActionTarget {
  cwd: string
  name: string
  sessionId?: string
  sessionPath?: string
}

/**
 * Picks the next visible active session inside the closed session's section,
 * preferring the following row and then the previous one.
 */
export function nextActiveSessionId(
  closedSessionId: string,
  group: WorkspaceGroup | undefined,
  sessions: readonly SessionSummary[],
): string | null {
  const activeIds = (group?.sessions ?? []).flatMap((row) => {
    const active = sessions.find((session) =>
      session.sessionPath === row.sessionPath && session.status !== 'exited'
    )
    return active ? [active.id] : []
  })
  const closedIndex = activeIds.indexOf(closedSessionId)
  return closedIndex >= 0
    ? activeIds[closedIndex + 1] ?? activeIds[closedIndex - 1] ?? null
    : activeIds[0] ?? null
}
