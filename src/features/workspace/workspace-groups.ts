import type { RecentSession, SessionSummary } from '../../../shared/types.ts'

/** One collapsible workspace section of the session sidebar. */
export interface WorkspaceGroup {
  /** Canonical workspace directory shared by the section's sessions. */
  path: string
  /** Folder basename, qualified by its parent when another section shares it. */
  name: string
  /** Visible session rows, most recent activity first. */
  sessions: RecentSession[]
  /** Newest row timestamp, or 0 for a workspace that has no sessions yet. */
  latestActivity: number
}

/**
 * Builds the sidebar sections from every workspace that owns a visible session,
 * plus the workspaces the user added explicitly.
 *
 * Sections are ordered by their newest session activity. Explicitly added
 * workspaces without sessions keep their insertion order after the active ones.
 */
export function workspaceGroups(
  recentSessions: readonly RecentSession[],
  sentSessions: readonly RecentSession[],
  liveSessions: readonly SessionSummary[],
  workspacePaths: readonly string[],
): WorkspaceGroup[] {
  const rows = sidebarSessionRows(recentSessions, sentSessions, liveSessions)
  const paths = uniquePaths([...workspacePaths, ...rows.map((row) => row.cwd)])
  return paths
    .map((path) => {
      const sessions = rows
        .filter((row) => row.cwd === path)
        .sort((left, right) => right.updatedAt - left.updatedAt)
      return {
        path,
        name: workspaceName(path, paths),
        sessions,
        latestActivity: sessions[0]?.updatedAt ?? 0,
      }
    })
    .sort((left, right) => right.latestActivity - left.latestActivity)
}

/**
 * Merges persisted and optimistically sent sessions, keeping a sent session
 * visible only while persistence does not return it yet.
 */
export function sidebarSessionRows(
  recentSessions: readonly RecentSession[],
  sentSessions: readonly RecentSession[] = [],
  liveSessions: readonly SessionSummary[] = [],
): RecentSession[] {
  const recentIds = new Set(recentSessions.map((session) => session.id))
  const recentPaths = new Set(recentSessions.map((session) => session.sessionPath))
  const pending = sentSessions.filter((session) =>
    !recentIds.has(session.id) && !recentPaths.has(session.sessionPath)
  )
  const visibleIds = new Set([...recentIds, ...pending.map((session) => session.id)])
  const visiblePaths = new Set([...recentPaths, ...pending.map((session) => session.sessionPath)])
  const liveRows: RecentSession[] = []
  for (const session of liveSessions) {
    if (
      !session.sessionPath
      || session.status === 'exited'
      || visibleIds.has(session.id)
      || visiblePaths.has(session.sessionPath)
    ) continue
    liveRows.push({
      id: session.id,
      cwd: session.cwd,
      name: session.name,
      sessionPath: session.sessionPath,
      // Pi summaries do not expose activity timestamps; persisted rows replace these as soon as
      // their history is available.
      updatedAt: 0,
    })
    visibleIds.add(session.id)
    visiblePaths.add(session.sessionPath)
  }
  return [...pending, ...liveRows, ...recentSessions]
}

/**
 * Names a workspace after its folder. When two sections share a basename, the
 * parent folder disambiguates them; a full path remains the last resort.
 */
export function workspaceName(path: string, paths: readonly string[]): string {
  const segments = pathSegments(path)
  const base = segments.at(-1) ?? path
  const sharedBase = paths.filter((candidate) => pathSegments(candidate).at(-1) === base).length > 1
  if (!sharedBase) return base
  const parent = segments.at(-2)
  if (!parent) return path
  const qualified = `${parent}/${base}`
  const qualifiedPaths = paths.filter((candidate) =>
    pathSegments(candidate).slice(-2).join('/') === qualified
  )
  return qualifiedPaths.length > 1 ? path : qualified
}

/** Splits a POSIX or Windows path into its non-empty segments. */
function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0)
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const path of paths) {
    if (!path || seen.has(path)) continue
    seen.add(path)
    unique.push(path)
  }
  return unique
}
