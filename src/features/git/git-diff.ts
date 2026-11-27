import { intraLineDiff, type IntraLineSegment } from '../../../shared/text-diff.ts'

export interface GitDiffLine {
  content: string
  kind: 'added' | 'context' | 'removed'
  newLine: number | null
  oldLine: number | null
  /** Word-level highlights, set only for isolated one-line replacements. */
  segments?: IntraLineSegment[]
}

/** Unchanged lines omitted between two hunks. */
export interface GitDiffGap {
  count: number
  kind: 'gap'
}

export type GitDiffEntry = GitDiffGap | GitDiffLine

/**
 * Turns a unified diff into colorable rows. Hunk headers become the count of
 * unchanged lines between hunks, and one-line replacements carry word-level
 * highlights, so a long diff stays scannable at sidebar width.
 */
export function parseGitDiff(diff: string): GitDiffEntry[] {
  const entries: GitDiffEntry[] = []
  let inHunk = false
  let oldLine = 0
  let newLine = 0
  /** Old-side line last covered by the previous hunk, or null before the first one. */
  let previousHunkEnd: number | null = null

  for (const line of diff.split('\n')) {
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (hunk) {
      const oldStart = Number(hunk[1])
      const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2])
      if (previousHunkEnd !== null && oldStart > previousHunkEnd + 1)
        entries.push({ count: oldStart - previousHunkEnd - 1, kind: 'gap' })
      oldLine = oldStart
      newLine = Number(hunk[3])
      previousHunkEnd = oldStart + oldCount - 1
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('-')) {
      entries.push({ content: line.slice(1), kind: 'removed', newLine: null, oldLine })
      oldLine += 1
    } else if (line.startsWith('+')) {
      entries.push({ content: line.slice(1), kind: 'added', newLine, oldLine: null })
      newLine += 1
    } else if (line.startsWith(' ')) {
      entries.push({ content: line.slice(1), kind: 'context', newLine, oldLine })
      oldLine += 1
      newLine += 1
    }
  }

  return highlightReplacedLines(entries)
}

/** Adds word-level highlights when a single line replaces a single line. */
function highlightReplacedLines(entries: GitDiffEntry[]): GitDiffEntry[] {
  const rows: GitDiffEntry[] = []
  let index = 0

  while (index < entries.length) {
    const entry = entries[index]
    if (entry.kind !== 'removed') {
      rows.push(entry)
      index += 1
      continue
    }

    const removed: GitDiffLine[] = []
    while (index < entries.length) {
      const next = entries[index]
      if (next.kind !== 'removed') break
      removed.push(next)
      index += 1
    }
    const added: GitDiffLine[] = []
    while (index < entries.length) {
      const next = entries[index]
      if (next.kind !== 'added') break
      added.push(next)
      index += 1
    }

    if (removed.length !== 1 || added.length !== 1) {
      rows.push(...removed, ...added)
      continue
    }

    const segments = intraLineDiff(removed[0].content, added[0].content)
    rows.push(
      { ...removed[0], segments: segments.filter((segment) => segment.kind !== 'added') },
      { ...added[0], segments: segments.filter((segment) => segment.kind !== 'removed') },
    )
  }

  return rows
}
