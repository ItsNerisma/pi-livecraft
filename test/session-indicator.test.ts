import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionSummary } from '../shared/types.ts'
import {
  hasUnseenCompletion,
  sessionIndicator,
} from '../src/features/workspace/session-indicator.ts'

const session: SessionSummary = {
  id: 'session-1',
  cwd: '/workspace',
  name: 'Session',
  status: 'running',
  pendingUi: [],
}

test('prioritizes attention and clears completed sessions when they are consulted', () => {
  const completed = new Set([session.id])
  const noneCompacting = new Set<string>()

  assert.equal(sessionIndicator(session, '', noneCompacting, completed), 'working')
  assert.equal(
    sessionIndicator({ ...session, status: 'starting' }, '', noneCompacting, completed),
    'working',
  )
  assert.equal(
    sessionIndicator(
      { ...session, pendingUi: [{ method: 'confirm' }] },
      '',
      noneCompacting,
      completed,
    ),
    'waiting',
  )
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, '', noneCompacting, completed),
    'complete',
  )
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, session.id, noneCompacting, completed),
    'idle',
  )
})

test('marks a live idle session without a completion event as idle', () => {
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, '', new Set(), new Set()),
    'idle',
  )
})

test('survives a page refresh: restored completed ids still show complete for idle, non-selected sessions', () => {
  // After a refresh, sessionStorage restores completed ids; the manager reports the session as idle.
  const restored = new Set([session.id])

  // Still idle, not selected, in restored set → complete indicator survives refresh.
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, '', new Set(), restored),
    'complete',
  )

  // Persisting the stable session path also survives a manager restart.
  const restoredPath = new Set(['/sessions/session.jsonl'])
  assert.equal(
    sessionIndicator(
      { ...session, status: 'idle', sessionPath: '/sessions/session.jsonl' },
      '',
      new Set(),
      restoredPath,
    ),
    'complete',
  )
  // If the manager reports it as running (still working), 'working' takes priority.
  assert.equal(
    sessionIndicator({ ...session, status: 'running' }, '', new Set(), restored),
    'working',
  )
  // Selected sessions keep the linked-process idle marker instead of showing complete.
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, session.id, new Set(), restored),
    'idle',
  )
})

test('prioritizes compacting over working and complete', () => {
  const completed = new Set([session.id])
  const compacting = new Set([session.id])
  const noneCompacting = new Set<string>()

  assert.equal(sessionIndicator(session, '', compacting, completed), 'compacting')
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, '', compacting, completed),
    'compacting',
  )
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, session.id, compacting, completed),
    'compacting',
  )
  assert.equal(
    sessionIndicator({ ...session, status: 'idle' }, '', noneCompacting, completed),
    'complete',
  )
})

test('never reports an unseen completion for the session on screen', () => {
  // Regression: the tab badge used to stay lit for the session already displayed, because the
  // favicon check ignored the selection rule the sidebar marker follows.
  assert.equal(hasUnseenCompletion([session], '', new Set([session.id])), true)
  assert.equal(hasUnseenCompletion([session], session.id, new Set([session.id])), false)

  // A restored marker named by the session path must also lose to the selection.
  const withPath = { ...session, sessionPath: '/sessions/session.jsonl' }
  const restored = new Set(['/sessions/session.jsonl'])
  assert.equal(hasUnseenCompletion([withPath], '', restored), true)
  assert.equal(hasUnseenCompletion([withPath], withPath.id, restored), false)

  // Another session finishing keeps the badge up.
  const other: SessionSummary = { ...session, id: 'session-2' }
  assert.equal(hasUnseenCompletion([session, other], other.id, new Set([session.id])), true)

  // A marker that no listed session answers cannot badge the tab.
  assert.equal(hasUnseenCompletion([session], '', new Set(['gone'])), false)
  assert.equal(hasUnseenCompletion([], '', new Set([session.id])), false)
})
