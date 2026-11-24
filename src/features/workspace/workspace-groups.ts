import type { RecentSession, SessionSummary } from '../../../shared/types.ts'
import { defaultExpandedWorkspaceSectionCount } from './workspace-sidebar.ts'

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
        .sort(newestActivityFirst)
      return {
        path,
        name: workspaceName(path, paths),
        sessions,
        // Unknown activity from an unpersisted live session must not reorder the sections.
        latestActivity: sessions.reduce((latest, row) => Math.max(latest, row.updatedAt), 0),
      }
    })
    .sort((left, right) => right.latestActivity - left.latestActivity)
}

/**
 * Paths a fresh browser starts with collapsed: every section except the most recent ones,
 * so an accumulated history stays scannable instead of unfolding every workspace.
 */
export function defaultCollapsedWorkspacePaths(
  groups: readonly WorkspaceGroup[],
  expandedCount: number = defaultExpandedWorkspaceSectionCount,
): ReadonlySet<string> {
  return new Set(groups.slice(expandedCount).map((group) => group.path))
}

/**
 * Sections whose name or path contains the query, case-insensitively, with the sections
 * whose name starts with it first. Each match keeps its own collapse state and sessions;
 * an empty query keeps every section in its current order.
 */
export function filterWorkspaceGroups(
  groups: readonly WorkspaceGroup[],
  query: string,
): WorkspaceGroup[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...groups]
  const matches = groups.filter((group) =>
    group.name.toLowerCase().includes(needle) || group.path.toLowerCase().includes(needle)
  )
  // Sections are ordered by activity, and a stable sort keeps that order inside each group:
  // a name that starts with the query ranks above one that merely contains it.
  return matches.sort(
    (left, right) => matchRank(left, needle) - matchRank(right, needle),
  )
}

function matchRank(group: WorkspaceGroup, needle: string): number {
  return group.name.toLowerCase().startsWith(needle) ? 0 : 1
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
      // their history is available, and ordering treats the unknown timestamp as the newest.
      updatedAt: 0,
    })
    visibleIds.add(session.id)
    visiblePaths.add(session.sessionPath)
  }
  return [...pending, ...liveRows, ...recentSessions]
}

/**
 * Orders a section's rows newest first. A live session carries no activity timestamp
 * until Pi persists its history, and it is the newest row by definition: it was just
 * started, so it must stay inside the visible rows instead of unfolding the section.
 */
function newestActivityFirst(left: RecentSession, right: RecentSession): number {
  if (left.updatedAt === 0 || right.updatedAt === 0) {
    if (left.updatedAt === right.updatedAt) return 0
    return left.updatedAt === 0 ? -1 : 1
  }
  return right.updatedAt - left.updatedAt
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
