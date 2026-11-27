import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'
import type {
  GitFileDiff,
  GitPushResult,
  GitResetResult,
  GitRevertResult,
  GitSnapshot,
} from '../../../shared/types.ts'
import { resolveFileIcon } from '../../../shared/file-icon.ts'
import { WidgetLayout } from '../right-sidebar/WidgetLayout.tsx'
import { GitDiff } from './GitDiff.tsx'
import { parseGitDiff } from './git-diff.ts'

/** Local git-error target — which element to shake on failure. */
type ErrorTarget = 'push' | 'commit' | 'discard' | 'refresh'

/** Owns Git-specific selection, actions, and diff rendering inside the sidebar. */
export function GitWidget(
  { snapshot, onCommit, onDiscard, onFileSelect, onPush, onRefresh, onReset, onRevert }: {
    snapshot: GitSnapshot
    onCommit: (message: string) => Promise<void>
    onDiscard: (path?: string) => Promise<void>
    onFileSelect: (path: string, commitHash?: string) => Promise<GitFileDiff>
    onPush: () => Promise<GitPushResult>
    onRefresh: () => Promise<void>
    onReset: (hash: string) => Promise<GitResetResult>
    onRevert: (hash: string) => Promise<GitRevertResult>
  },
) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [exitingCommits, setExitingCommits] = useState<ReadonlySet<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorTarget, setErrorTarget] = useState<ErrorTarget | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hasChanges = snapshot.files.length > 0
  const workingTotals = snapshot.files.reduce(
    (totals, file) => ({
      additions: totals.additions + (file.additions ?? 0),
      deletions: totals.deletions + (file.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  )

  /** Clears any stuck error highlight after the shake animation ends. */
  useEffect(() => {
    if (!errorTarget) return
    clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setErrorTarget(null), 500)
    return () => clearTimeout(errorTimerRef.current)
  }, [errorTarget])

  /** Clears the current Git error so the next action can report independently. */
  const clearError = useCallback(() => {
    setErrorMessage(null)
    setErrorTarget(null)
  }, [])

  /** Reports a failed Git action inside the widget and highlights its control when available. */
  function reportError(error: unknown, target?: ErrorTarget): void {
    setErrorMessage(error instanceof Error ? error.message : 'Git command failed.')
    setErrorTarget(target ?? null)
  }

  /** Commits all changes with the current message, then refreshes. */
  async function commit(): Promise<void> {
    setBusy(true)
    clearError()
    try {
      await onCommit(message)
      setMessage('')
      await onRefresh()
    } catch (error) {
      reportError(error, 'commit')
    } finally {
      setBusy(false)
    }
  }

  /** Pushes commits ahead of the tracked branch, fading them out before refresh. */
  async function push(): Promise<void> {
    setBusy(true)
    clearError()
    try {
      const result = await onPush()
      if (result.pushError) throw new Error(result.pushError)
      // ponytail: fade all then refresh; per-commit fade not worth the wiring
      setExitingCommits(new Set(snapshot.commits.map((c) => c.hash)))
      await new Promise((r) => setTimeout(r, 300))
      await onRefresh()
      setExitingCommits(new Set())
    } catch (error) {
      reportError(error, 'push')
    } finally {
      setBusy(false)
    }
  }

  /** Discards one file or all uncommitted changes after confirmation, then refreshes. */
  async function discard(path?: string): Promise<void> {
    const target = path ? `changes to ${path}` : 'all uncommitted changes'
    if (!window.confirm(`Discard ${target}? This will delete new files and revert modifications.`))
      return
    setBusy(true)
    clearError()
    try {
      await onDiscard(path)
      await onRefresh()
    } catch (error) {
      reportError(error, 'discard')
    } finally {
      setBusy(false)
    }
  }

  /** Resets the latest commit after confirming that its changes stay local, fading its row before refresh. */
  async function resetCommit(hash: string): Promise<void> {
    if (
      !window.confirm(
        `Reset latest commit ${hash.slice(0, 7)}? Its changes will be kept in the working tree.`,
      )
    ) return
    setBusy(true)
    clearError()
    try {
      await onReset(hash)
      setExitingCommits(new Set([hash]))
      await new Promise((r) => setTimeout(r, 300))
      await onRefresh()
      setExitingCommits(new Set())
    } catch (error) {
      reportError(error, 'commit')
    } finally {
      setBusy(false)
    }
  }

  /** Reverts the chosen commit after confirmation, then refreshes so the new revert commit appears. */
  async function revertCommit(hash: string): Promise<void> {
    if (!window.confirm(`Revert commit ${hash.slice(0, 7)}?`)) return
    setBusy(true)
    clearError()
    try {
      await onRevert(hash)
      await onRefresh()
    } catch (error) {
      reportError(error, 'commit')
    } finally {
      setBusy(false)
    }
  }

  /** Manual Git refresh with local error handling. */
  async function handleRefresh(): Promise<void> {
    clearError()
    try {
      await onRefresh()
    } catch (error) {
      reportError(error, 'refresh')
    }
  }

  return (
    <WidgetLayout
      footer={
        <form
          className='git-actions'
          onSubmit={(event) => {
            event.preventDefault()
            void commit()
          }}
        >
          <input
            aria-label='Commit message'
            disabled={busy}
            onChange={(event) => setMessage(event.target.value)}
            placeholder='Commit message'
            value={message}
          />
          <div className='git-action-buttons'>
            <button
              className={errorTarget === 'commit' ? 'shake' : ''}
              disabled={busy || !hasChanges || !message.trim()}
              type='submit'
            >
              Commit
            </button>
            <button
              className={errorTarget === 'push' ? 'shake' : ''}
              disabled={busy || snapshot.ahead === 0}
              onClick={() => void push()}
              type='button'
            >
              Push{snapshot.ahead > 0 ? ` ${snapshot.ahead}` : ''}
            </button>
            <button
              className={`git-discard${errorTarget === 'discard' ? ' shake' : ''}`}
              disabled={busy || !hasChanges}
              onClick={() => void discard()}
              type='button'
            >
              Reset
            </button>
          </div>
        </form>
      }
      header={
        <>
          <div>
            <strong>{snapshot.branch}</strong>
            <span>
              {hasChanges
                ? `${snapshot.files.length} file${snapshot.files.length > 1 ? 's' : ''} modified`
                : 'Clean tree'}
              {hasChanges && workingTotals.additions + workingTotals.deletions > 0 && (
                <>
                  {' '}
                  <b className='git-add'>+{workingTotals.additions}</b>{' '}
                  <i className='git-del'>−{workingTotals.deletions}</i>
                </>
              )}
            </span>
          </div>
          <Tooltip label='Refresh'>
            <button
              aria-label='Refresh Git state'
              className={`git-refresh${errorTarget === 'refresh' ? ' shake' : ''}`}
              onClick={() => void handleRefresh()}
              type='button'
            >
              ↻
            </button>
          </Tooltip>
        </>
      }
    >
      {errorMessage && <p className='git-error' role='alert'>{errorMessage}</p>}
      <>
        {hasChanges && (
          <ul className='git-file-list'>
            {snapshot.files.map((file) => (
              <GitFileDisclosure
                file={file}
                key={file.path}
                onDiscard={() => void discard(file.path)}
                onFileSelect={onFileSelect}
                busy={busy}
              />
            ))}
          </ul>
        )}
        {snapshot.commits.length > 0 && (
          <section
            className={`git-commits${
              exitingCommits.size === snapshot
                  .commits
                  .length
                ? ' exiting'
                : ''
            }`}
            aria-label='Unpushed commits'
          >
            <h2>
              Unpushed commits <small>{snapshot.commits.length}</small>
            </h2>
            {snapshot.commits.map((commit, index) => (
              <div
                className={`git-commit${
                  exitingCommits.has(commit.hash)
                    ? ' exiting'
                    : ''
                }`}
                key={commit.hash}
              >
                <details>
                  <summary>
                    <Tooltip label={commit.subject}>
                      <code>{commit.hash.slice(0, 7)}</code>
                      <span>{commit.subject}</span>
                    </Tooltip>
                  </summary>
                  {commit.files.length > 0
                    ? (
                      <ul className='git-file-list git-commit-files'>
                        {commit
                          .files
                          .map((file) => (
                            <GitFileDisclosure
                              commitHash={commit.hash}
                              file={file}
                              key={file.path}
                              onFileSelect={onFileSelect}
                            />
                          ))}
                      </ul>
                    )
                    : <p className='git-empty'>No files modified.</p>}
                </details>
                <div className='git-commit-actions'>
                  <Tooltip label='Revert this commit'>
                    <button
                      aria-label={`Revert commit ${commit.hash.slice(0, 7)}`}
                      className='git-commit-action git-revert'
                      disabled={busy}
                      onClick={() => void revertCommit(commit.hash)}
                      type='button'
                    >
                      ↶
                    </button>
                  </Tooltip>
                  {index === 0 && (
                    <Tooltip label='Reset this commit'>
                      <button
                        aria-label={`Reset commit ${commit.hash.slice(0, 7)}`}
                        className='git-commit-action git-reset'
                        disabled={busy}
                        onClick={() => void resetCommit(commit.hash)}
                        type='button'
                      >
                        🗑︎
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
        {!hasChanges && snapshot.ahead === 0 && <p className='git-empty'>No changes to commit.</p>}
      </>
    </WidgetLayout>
  )
}

/** Displays an expandable file row and loads its diff the first time it opens. */
function GitFileDisclosure(
  { file, commitHash, onFileSelect, onDiscard, busy }: {
    file: GitSnapshot['files'][number]
    commitHash?: string
    onFileSelect: (path: string, commitHash?: string) => Promise<GitFileDiff>
    onDiscard?: () => void
    busy?: boolean
  },
) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [diff, setDiff] = useState<GitFileDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectable = file.status === 'added' || file.status === 'modified'
  const entries = useMemo(() => (diff ? parseGitDiff(diff.diff) : []), [diff])

  async function toggle(): Promise<void> {
    if (expanded) {
      setExpanded(false)
      return
    }

    setExpanded(true)
    setError(null)
    if (diff || !selectable) return

    setLoading(true)
    try {
      setDiff(await onFileSelect(file.path, commitHash))
    } catch (cause) {
      setExpanded(false)
      setError(cause instanceof Error ? cause.message : 'Unable to load this diff.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <li className='git-file-item'>
      {selectable
        ? (
          <button
            aria-expanded={expanded}
            className='git-file-button'
            onClick={() => void toggle()}
            type='button'
          >
            <GitFileRow file={file} />
          </button>
        )
        : <GitFileRow file={file} />}
      {onDiscard && (
        <Tooltip label={`Discard changes to ${file.path}`}>
          <button
            aria-label={`Discard changes to ${file.path}`}
            className='git-file-discard'
            disabled={busy}
            onClick={onDiscard}
            type='button'
          >
            ↶
          </button>
        </Tooltip>
      )}
      {expanded && (
        <div className='git-inline-diff'>
          {loading
            ? <p className='git-empty'>Loading diff…</p>
            : error
            ? <p className='git-error' role='alert'>{error}</p>
            : diff
            ? <GitDiff entries={entries} path={diff.path} />
            : null}
        </div>
      )}
    </li>
  )
}

function GitFileRow({ file }: { file: GitSnapshot['files'][number] }) {
  const fileIcon = resolveFileIcon(file.path)
  const statusLabel = gitStatusLabel(file.status)

  return (
    <>
      <Tooltip hint={`${fileIcon.label} file`} label={statusLabel}>
        <span
          aria-label={`${statusLabel} ${fileIcon.label} file`}
          className={`git-file-status ${file.status}`}
          role='img'
        >
          <span
            aria-hidden='true'
            className='git-file-icon'
            data-color={fileIcon.color}
          >
            {fileIcon.glyph}
          </span>
        </span>
      </Tooltip>
      <Tooltip label={file.path}>
        <span className='git-file-path'>{file.path}</span>
      </Tooltip>
      <span className='git-file-counts'>
        <b>+{file.additions ?? '—'}</b>
        <i>−{file.deletions ?? '—'}</i>
      </span>
    </>
  )
}

function gitStatusLabel(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'Added', deleted: 'Deleted', modified: 'Modified', renamed: 'Renamed' }[status]
}
