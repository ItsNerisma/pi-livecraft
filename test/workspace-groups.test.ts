import assert from 'node:assert/strict'
import test from 'node:test'
import type { RecentSession } from '../shared/types.ts'
import {
  sidebarSessionRows,
  workspaceGroups,
  workspaceName,
} from '../src/features/workspace/workspace-groups.ts'

function session(cwd: string, id: string, updatedAt: number): RecentSession {
  return {
    id,
    cwd,
    name: `Session ${id}`,
    sessionPath: `/sessions/${id}.jsonl`,
    updatedAt,
  }
}

test('groups sessions by workspace with the newest activity first', () => {
  const groups = workspaceGroups(
    [
      session('/old', 'old', 100),
      session('/recent', 'recent', 500),
      session('/old', 'old-2', 300),
    ],
    [],
    [],
  )

  assert.deepEqual(groups.map(({ path, latestActivity }) => ({ path, latestActivity })), [
    { path: '/recent', latestActivity: 500 },
    { path: '/old', latestActivity: 300 },
  ])
  assert.deepEqual(groups[1].sessions.map(({ id }) => id), ['old-2', 'old'])
})

test('keeps explicitly added workspaces without sessions after active ones', () => {
  const groups = workspaceGroups(
    [session('/active', 'active', 100)],
    [],
    ['/empty', '/active'],
  )

  assert.deepEqual(groups.map(({ path }) => path), ['/active', '/empty'])
  assert.deepEqual(groups[1].sessions, [])
  assert.equal(groups[1].latestActivity, 0)
})

test('keeps a sent session visible until persistence returns it', () => {
  const pending = session('/active', 'pending', 200)
  const persisted = session('/active', 'persisted', 100)

  assert.deepEqual(
    workspaceGroups([persisted], [pending], []).map(({ sessions }) => sessions.map(({ id }) => id)),
    [['pending', 'persisted']],
  )
  assert.deepEqual(
    workspaceGroups([persisted, pending], [pending], []).flatMap(({ sessions }) =>
      sessions.map(({ id }) => id)
    ),
    ['pending', 'persisted'],
  )
})

test('names sections after their folder and qualifies shared basenames', () => {
  const paths = ['/home/ana/dev/app', '/home/ana/tools/app', '/home/ana/dev/pi']
  assert.equal(workspaceName('/home/ana/dev/pi', paths), 'pi')
  assert.equal(workspaceName('/home/ana/dev/app', paths), 'dev/app')
  assert.equal(workspaceName('/home/ana/tools/app', paths), 'tools/app')
})

test('falls back to the full path when parent folders also collide', () => {
  const paths = ['/one/dev/app', '/two/dev/app']
  assert.equal(workspaceName('/one/dev/app', paths), '/one/dev/app')
  assert.equal(workspaceName('/two/dev/app', paths), '/two/dev/app')
})

test('reads Windows workspaces with either separator', () => {
  const paths = ['C:\\dev\\app', 'D:\\dev\\app']
  assert.equal(workspaceName('C:\\dev\\app', paths), 'C:\\dev\\app')
  assert.equal(workspaceName('C:\\dev\\app\\', ['C:\\dev\\app\\']), 'app')
})

test('deduplicates sessions and ignores empty workspace paths', () => {
  const rows = sidebarSessionRows([session('/active', 'a', 1)], [session('/active', 'b', 2)])
  assert.deepEqual(rows.map(({ id }) => id), ['b', 'a'])
  assert.deepEqual(workspaceGroups(rows, [], ['']).map(({ path }) => path), ['/active'])
})
