import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'
import type { RecentSession, SessionSummary } from '../../../shared/types.ts'
import { sessionIndicator } from './session-indicator.ts'
import { SessionStatusIndicator } from './SessionStatusIndicator.tsx'
import type { SessionActionTarget } from './sidebar-sessions.ts'
import { SessionRenameDialog } from './SessionRenameDialog.tsx'
import type { WorkspaceGroup } from './workspace-groups.ts'
import {
  maxWorkspaceSidebarWidth,
  minWorkspaceSidebarWidth,
  visibleWorkspaceSessionCount,
} from './workspace-sidebar.ts'

interface ContextMenuState {
  target: SessionActionTarget
  x: number
  y: number
}

interface WorkspaceSidebarProps {
  collapsed: boolean
  collapsedWorkspacePaths: ReadonlySet<string>
  compactingSessionIds: ReadonlySet<string>
  completedSessionIds: ReadonlySet<string>
  groups: WorkspaceGroup[]
  isRefreshing: boolean
  selectedId: string
  sessions: SessionSummary[]
  width: number
  onCloseSession: (sessionId: string) => Promise<void>
  onCreateInWorkspace: (path: string) => Promise<void>
  onNewSession: () => void
  onOpenSession: (row: RecentSession) => Promise<void>
  onOpenSettings: () => void
  onRenameSession: (target: SessionActionTarget, name: string) => Promise<void>
  onToggleWorkspaceCollapsed: (path: string) => void
  onResize: (width: number) => void
  onToggleCollapsed: () => void
  onError: (cause: unknown) => void
}

/** Displays one collapsible section per workspace and its recent Pi sessions. */
export function WorkspaceSidebar({
  collapsed,
  collapsedWorkspacePaths,
  compactingSessionIds,
  completedSessionIds,
  groups,
  isRefreshing,
  selectedId,
  sessions,
  width,
  onCloseSession,
  onCreateInWorkspace,
  onNewSession,
  onOpenSession,
  onOpenSettings,
  onRenameSession,
  onToggleWorkspaceCollapsed,
  onResize,
  onToggleCollapsed,
  onError,
}: WorkspaceSidebarProps) {
  const [openingSessionPath, setOpeningSessionPath] = useState('')
  const [creatingInPath, setCreatingInPath] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState({ left: 0, top: 0 })
  const [renameTarget, setRenameTarget] = useState<SessionActionTarget | null>(null)
  const [expandedWorkspacePaths, setExpandedWorkspacePaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const revealedSelectionIdRef = useRef('')
  const selectedSessionRef = useRef<HTMLButtonElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const contextMenuTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedSessionRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [groups, selectedId, expandedWorkspacePaths])

  // A selection made outside the list, such as a shortcut or the restored session, must stay
  // reachable, so the section holding it reveals its full history once.
  useEffect(() => {
    if (!selectedId || selectedId === revealedSelectionIdRef.current) return
    const sessionPath = sessions.find((session) => session.id === selectedId)?.sessionPath
    const group = sessionPath
      ? groups.find((candidate) =>
        candidate.sessions.some((row) => row.sessionPath === sessionPath)
      )
      : undefined
    // History may still be loading; the next render resolves the section.
    if (!group) return
    revealedSelectionIdRef.current = selectedId
    const index = group.sessions.findIndex((row) => row.sessionPath === sessionPath)
    if (index < visibleWorkspaceSessionCount) return
    setExpandedWorkspacePaths((current) =>
      current.has(group.path) ? current : new Set(current).add(group.path)
    )
  }, [groups, selectedId, sessions])

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const { width: menuWidth, height: menuHeight } = contextMenuRef.current.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, contextMenu.x),
      Math.max(8, window.innerWidth - menuWidth - 8),
    )
    const top = Math.min(
      Math.max(8, contextMenu.y),
      Math.max(8, window.innerHeight - menuHeight - 8),
    )
    setContextMenuPosition({ left, top })
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu) return
    const dismissOnPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node) || !contextMenuRef.current?.contains(event.target)) {
        setContextMenu(null)
      }
    }
    const dismissOnKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setContextMenu(null)
      contextMenuTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', dismissOnPointerDown)
    document.addEventListener('keydown', dismissOnKeyDown)
    return () => {
      document.removeEventListener('pointerdown', dismissOnPointerDown)
      document.removeEventListener('keydown', dismissOnKeyDown)
    }
  }, [contextMenu])

  function dismissContextMenu(): void {
    setContextMenu(null)
    contextMenuTriggerRef.current?.focus()
  }

  function openContextMenu(
    target: SessionActionTarget,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void {
    event.preventDefault()
    contextMenuTriggerRef.current = event.currentTarget
    setContextMenu({ target, x: event.clientX, y: event.clientY })
  }

  function openContextMenuFromKeyboard(
    target: SessionActionTarget,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
    event.preventDefault()
    contextMenuTriggerRef.current = event.currentTarget
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ target, x: rect.left, y: rect.bottom })
  }

  function startRename(): void {
    if (!contextMenu) return
    const { target } = contextMenu
    dismissContextMenu()
    setRenameTarget(target)
  }

  function dismissRename(): void {
    setRenameTarget(null)
    contextMenuTriggerRef.current?.focus()
  }

  async function closeTarget(): Promise<void> {
    const sessionId = contextMenu?.target.sessionId
    dismissContextMenu()
    if (!sessionId) return
    try {
      await onCloseSession(sessionId)
    } catch (cause) {
      onError(cause)
    }
  }

  function openRow(row: RecentSession): void {
    setOpeningSessionPath(row.sessionPath)
    void onOpenSession(row).catch(onError).finally(() =>
      setOpeningSessionPath((current) => current === row.sessionPath ? '' : current)
    )
  }

  async function createInWorkspace(path: string): Promise<void> {
    setCreatingInPath(path)
    try {
      await onCreateInWorkspace(path)
    } catch (cause) {
      onError(cause)
    } finally {
      setCreatingInPath('')
    }
  }

  function toggleWorkspace(path: string): void {
    // Collapsing a section drops its extra rows, so reopening it starts from the default step.
    if (!collapsedWorkspacePaths.has(path)) {
      setExpandedWorkspacePaths((current) => {
        if (!current.has(path)) return current
        const next = new Set(current)
        next.delete(path)
        return next
      })
    }
    onToggleWorkspaceCollapsed(path)
  }

  function toggleWorkspaceExpanded(path: string): void {
    setExpandedWorkspacePaths((current) => {
      const next = new Set(current)
      if (!next.delete(path)) next.add(path)
      return next
    })
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget
    const initialX = event.clientX
    const initialWidth = width
    handle.setPointerCapture(event.pointerId)

    const resize = (moveEvent: PointerEvent): void =>
      onResize(initialWidth + moveEvent.clientX - initialX)
    const stop = (): void => {
      handle.removeEventListener('pointermove', resize)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
      handle.removeEventListener('lostpointercapture', stop)
    }

    handle.addEventListener('pointermove', resize)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
    handle.addEventListener('lostpointercapture', stop)
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const adjustment = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0
    if (adjustment) {
      event.preventDefault()
      onResize(width + adjustment)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      onResize(minWorkspaceSidebarWidth)
    }
    if (event.key === 'End') {
      event.preventDefault()
      onResize(maxWorkspaceSidebarWidth)
    }
  }

  const contextMenuSessionPath = contextMenu?.target.sessionPath

  return (
    <aside
      aria-label='Session sidebar'
      className={`sidebar${collapsed ? ' collapsed' : ''}`}
    >
      <div className='sidebar-rail'>
        <Tooltip label='Expand session sidebar'>
          <button
            aria-expanded={false}
            aria-label='Expand session sidebar'
            className='sidebar-toggle'
            onClick={onToggleCollapsed}
            type='button'
          >
            <SidebarToggleIcon collapsed />
          </button>
        </Tooltip>
      </div>
      <div
        aria-label='Resize session sidebar'
        aria-orientation='vertical'
        aria-valuemax={maxWorkspaceSidebarWidth}
        aria-valuemin={minWorkspaceSidebarWidth}
        aria-valuenow={width}
        className='sidebar-resize-handle'
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        role='separator'
        tabIndex={0}
      />
      <div className='brand'>
        <span className='brand-mark'>π</span>
        <div>
          <strong>Pi Livecraft</strong>
          <small>Local workspaces</small>
        </div>
        <Tooltip label='Settings'>
          <button
            aria-label='Open settings'
            className='settings-button'
            onClick={onOpenSettings}
            type='button'
          >
            <SettingsIcon />
          </button>
        </Tooltip>
        <Tooltip label='Collapse session sidebar'>
          <button
            aria-expanded={true}
            aria-label='Collapse session sidebar'
            className='sidebar-toggle'
            onClick={onToggleCollapsed}
            type='button'
          >
            <SidebarToggleIcon collapsed={false} />
          </button>
        </Tooltip>
      </div>
      <button className='new-session' onClick={onNewSession} type='button'>
        ＋ New session
      </button>
      <nav className='workspace-sections' aria-label='Workspaces and their Pi sessions'>
        {isRefreshing && groups.length === 0 && (
          <p className='session-list-loading' role='status'>Loading sessions…</p>
        )}
        {groups.map((group, index) => {
          const groupCollapsed = collapsedWorkspacePaths.has(group.path)
          const expanded = expandedWorkspacePaths.has(group.path)
          const hiddenSessionCount = group.sessions.length - visibleWorkspaceSessionCount
          const visibleSessions = expanded
            ? group.sessions
            : group.sessions.slice(0, visibleWorkspaceSessionCount)
          const listId = `workspace-section-${index}`
          return (
            <section className='workspace-section' key={group.path}>
              <div className='workspace-section-header'>
                <Tooltip label={group.path}>
                  <button
                    aria-controls={listId}
                    aria-expanded={!groupCollapsed}
                    className='workspace-section-toggle'
                    onClick={() => toggleWorkspace(group.path)}
                    type='button'
                  >
                    <ChevronIcon collapsed={groupCollapsed} />
                    <span className='workspace-section-name'>{group.name}</span>
                    <span className='workspace-section-count'>{group.sessions.length}</span>
                  </button>
                </Tooltip>
                <Tooltip label={`New session in ${group.name}`}>
                  <button
                    aria-label={`New session in ${group.name}`}
                    className='workspace-section-new'
                    disabled={creatingInPath === group.path}
                    onClick={() => void createInWorkspace(group.path)}
                    type='button'
                  >
                    {creatingInPath === group.path ? '…' : '＋'}
                  </button>
                </Tooltip>
              </div>
              {!groupCollapsed && (
                <div className='session-list' id={listId}>
                  {visibleSessions.map((recentSession) => {
                    const activeSession = sessions.find((session) =>
                      session.sessionPath === recentSession.sessionPath
                      && session.status !== 'exited'
                    )
                    const indicator = sessionIndicator(
                      activeSession,
                      selectedId,
                      compactingSessionIds,
                      completedSessionIds,
                    )
                    const sessionLabel = openingSessionPath === recentSession.sessionPath
                      ? 'Opening…'
                      : recentSession.name
                    const actionTarget: SessionActionTarget = {
                      cwd: recentSession.cwd,
                      name: recentSession.name,
                      sessionId: activeSession?.id,
                      sessionPath: recentSession.sessionPath,
                    }
                    return (
                      <Tooltip
                        key={recentSession.sessionPath}
                        hint='Right-click to rename or close the session'
                        label={`${recentSession.name}\n${
                          new Date(recentSession.updatedAt).toLocaleString('en-US')
                        }`}
                      >
                        <button
                          aria-haspopup='menu'
                          className={`session-item${
                            activeSession?.id === selectedId ? ' selected' : ''
                          }${indicator ? ` ${indicator}` : ''}`}
                          disabled={openingSessionPath === recentSession.sessionPath}
                          onContextMenu={(event) => openContextMenu(actionTarget, event)}
                          onKeyDown={(event) => openContextMenuFromKeyboard(actionTarget, event)}
                          onClick={() => openRow(recentSession)}
                          ref={activeSession?.id === selectedId ? selectedSessionRef : undefined}
                          type='button'
                        >
                          {indicator && <SessionStatusIndicator status={indicator} />}
                          <span>
                            <strong>{sessionLabel}</strong>
                          </span>
                        </button>
                      </Tooltip>
                    )
                  })}
                  {hiddenSessionCount > 0 && (
                    <button
                      aria-controls={listId}
                      aria-expanded={expanded}
                      className='session-list-more'
                      onClick={() => toggleWorkspaceExpanded(group.path)}
                      type='button'
                    >
                      {expanded ? 'Show less' : `Show ${hiddenSessionCount} more`}
                    </button>
                  )}
                  {group.sessions.length === 0 && (
                    <p className='workspace-section-empty'>No saved sessions yet.</p>
                  )}
                </div>
              )}
            </section>
          )
        })}
        {groups.length === 0 && !isRefreshing && (
          <p className='empty-sidebar'>
            No workspaces yet. Start a session to open one.
          </p>
        )}
      </nav>
      {contextMenu && (
        <div
          aria-label='Session actions'
          className='session-context-menu'
          ref={contextMenuRef}
          role='menu'
          style={{ left: contextMenuPosition.left, top: contextMenuPosition.top }}
        >
          <button autoFocus onClick={startRename} role='menuitem' type='button'>
            Rename…
          </button>
          {contextMenuSessionPath && contextMenu.target.sessionId && (
            <button
              className='danger'
              onClick={() => void closeTarget()}
              role='menuitem'
              type='button'
            >
              Close session
            </button>
          )}
        </div>
      )}
      {renameTarget && (
        <SessionRenameDialog
          initialName={renameTarget.name}
          key={renameTarget.sessionPath ?? renameTarget.sessionId ?? renameTarget.name}
          onClose={dismissRename}
          onConfirm={(name) => onRenameSession(renameTarget, name)}
        />
      )}
    </aside>
  )
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden='true'
      fill='none'
      height='16'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='1.75'
      viewBox='0 0 24 24'
      width='16'
    >
      <path d='M3 3v18' />
      <path d={collapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
    </svg>
  )
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden='true'
      className='workspace-section-chevron'
      data-collapsed={collapsed}
      fill='none'
      height='14'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='1.75'
      viewBox='0 0 24 24'
      width='14'
    >
      <path d='m6 9 6 6 6-6' />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden='true'
      fill='none'
      height='16'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='1.5'
      viewBox='0 0 24 24'
      width='16'
    >
      <path d='M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z' />
      <path d='m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.9 1.9 0 0 0-3.2 1.3v.2a2 2 0 1 1-4 0v-.2a1.9 1.9 0 0 0-3.2-1.3l.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.9 1.9 0 0 0 2.2 12a1.9 1.9 0 0 0 1.2-3.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.9 1.9 0 0 0 3.2-1.3v-.2a2 2 0 1 1 4 0v.2a1.9 1.9 0 0 0 3.2 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.9 1.9 0 0 0 20.8 12a1.9 1.9 0 0 0-1.4 3Z' />
    </svg>
  )
}
