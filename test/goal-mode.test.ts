import assert from 'node:assert/strict'
import test from 'node:test'
import {
  goalCommandAvailable,
  goalSummary,
  readGoalState,
} from '../src/features/composer/goal-mode.ts'

const goal = { objective: 'Ship the migration', status: 'active' }

function eventMessage(kind: string, goalValue: unknown = goal, extra: object = {}) {
  return {
    role: 'custom',
    customType: 'pi-goal-event',
    content: 'Continue toward the goal',
    display: true,
    details: { kind, goal: goalValue, timestamp: 1, ...extra },
  }
}

test('detects the pi-goal command among session commands', () => {
  assert.equal(goalCommandAvailable([{ name: 'goal' }, { name: 'agent' }]), true)
  assert.equal(goalCommandAvailable([{ name: 'agent' }]), false)
  assert.equal(goalCommandAvailable([]), false)
})

test('reads the goal published by the latest pi-goal event', () => {
  assert.deepEqual(readGoalState([eventMessage('active')]), {
    objective: 'Ship the migration',
    status: 'active',
  })
  assert.deepEqual(readGoalState([eventMessage('continuation')]), {
    objective: 'Ship the migration',
    status: 'active',
  })
  assert.deepEqual(readGoalState([eventMessage('paused')]), {
    objective: 'Ship the migration',
    status: 'paused',
  })
  assert.deepEqual(readGoalState([eventMessage('budget_limited')]), {
    objective: 'Ship the migration',
    status: 'budget_limited',
  })
})

test('ignores events that do not come from pi-goal or carry no goal', () => {
  assert.equal(readGoalState([]), null)
  assert.equal(readGoalState([{ role: 'assistant', content: 'hello' }]), null)
  assert.equal(readGoalState([{ role: 'custom', customType: 'compaction', content: 'x' }]), null)
  assert.equal(readGoalState([eventMessage('active', { objective: '   ' })]), null)
  assert.equal(
    readGoalState([{ role: 'custom', customType: 'pi-goal-event', display: true }]),
    null,
  )
})

test('ends the goal on the latest cleared or complete event', () => {
  assert.equal(readGoalState([eventMessage('complete')]), null)
  assert.equal(readGoalState([eventMessage('cleared')]), null)
})

test('prefers the most recent event over an older one', () => {
  assert.equal(readGoalState([eventMessage('paused'), eventMessage('resumed')])?.status, 'active')
  assert.equal(readGoalState([eventMessage('active'), eventMessage('cleared')]), null)
})

test('collapses the objective onto one short banner line', () => {
  assert.equal(goalSummary('  Ship   the\nfeature  '), 'Ship the feature')
  const long = goalSummary('x'.repeat(400))
  assert.equal(long.length, 158)
  assert.ok(long.endsWith('…'))
})
