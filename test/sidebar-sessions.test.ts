import assert from 'node:assert/strict'
import test from 'node:test'
import type { RecentSession, SessionSummary } from '../shared/types.ts'
import { nextActiveSessionId } from '../src/features/workspace/sidebar-sessions.ts'
import { workspaceGroups } from '../src/features/workspace/workspace-groups.ts'

function row(id: string, updatedAt: number, cwd = '/workspace'): RecentSession {
  return {
    id,
    cwd,
    name: id,
    sessionPath: `/${id}.jsonl`,
    updatedAt,
  }
}

function live(session: RecentSession, status: SessionSummary['status']): SessionSummary {
  return {
    id: session.id,
    cwd: session.cwd,
    name: session.name,
    sessionPath: session.sessionPath,
    status,
    pendingUi: [],
  }
}

test('choisit la session active suivante dans la même section', () => {
  const rows = [row('closed', 30), row('next', 20), row('previous', 10)]
  const sessions = rows.map((session) => live(session, 'idle'))
  const [group] = workspaceGroups(rows, [], [], [])

  assert.equal(nextActiveSessionId('closed', group, sessions), 'next')
  assert.equal(nextActiveSessionId('next', group, sessions), 'previous')
  assert.equal(nextActiveSessionId('previous', group, sessions), 'next')
})

test('ignore les sessions sorties et les sections inconnues', () => {
  const rows = [row('closed', 30), row('exited', 20), row('other-workspace', 10, '/other')]
  const sessions = [
    live(rows[0], 'exited'),
    live(rows[1], 'exited'),
    live(rows[2], 'idle'),
  ]
  const [group] = workspaceGroups(rows, [], [], [])

  assert.equal(nextActiveSessionId('closed', group, sessions), null)
  assert.equal(nextActiveSessionId('closed', undefined, sessions), null)
})

test('sélectionne la première session active quand la session fermée est inconnue', () => {
  const rows = [row('first', 30), row('second', 20)]
  const sessions = [live(rows[0], 'idle'), live(rows[1], 'running')]
  const [group] = workspaceGroups(rows, [], [], [])

  assert.equal(nextActiveSessionId('missing', group, sessions), 'first')
})
