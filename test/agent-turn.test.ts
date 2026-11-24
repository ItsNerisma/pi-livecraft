import assert from 'node:assert/strict'
import test from 'node:test'
import { agentTurnFromSnapshot, piSessionBusy } from '../src/features/conversation/agent-turn.ts'

test('reads Pi activity from a session state payload', () => {
  assert.equal(
    piSessionBusy({ isStreaming: true, isCompacting: false, pendingMessageCount: 0 }),
    true,
  )
  assert.equal(
    piSessionBusy({ isStreaming: false, isCompacting: true, pendingMessageCount: 0 }),
    true,
  )
  assert.equal(
    piSessionBusy({ isStreaming: false, isCompacting: false, pendingMessageCount: 2 }),
    true,
  )
  assert.equal(
    piSessionBusy({ isStreaming: false, isCompacting: false, pendingMessageCount: 0 }),
    false,
  )
})

test('rejects a state payload that does not describe activity', () => {
  assert.equal(piSessionBusy(null), undefined)
  assert.equal(piSessionBusy({}), undefined)
  assert.equal(piSessionBusy({ isStreaming: true }), undefined)
  assert.equal(
    piSessionBusy({ isStreaming: 'yes', isCompacting: false, pendingMessageCount: 0 }),
    undefined,
  )
  assert.equal(
    piSessionBusy({ isStreaming: false, isCompacting: false, pendingMessageCount: -1 }),
    undefined,
  )
  assert.equal(
    piSessionBusy({ isStreaming: false, isCompacting: false, pendingMessageCount: 1.5 }),
    undefined,
  )
})

test('adopts snapshot activity only when no agent event is newer than the fetch', () => {
  assert.equal(agentTurnFromSnapshot(false, 0, 100), false)
  assert.equal(agentTurnFromSnapshot(true, 100, 100), true)
  // A live agent_settled applied after the fetch started is newer than the snapshot.
  assert.equal(agentTurnFromSnapshot(true, 150, 100), undefined)
  // A snapshot without activity truth never overrides the event-derived state.
  assert.equal(agentTurnFromSnapshot(undefined, 0, 100), undefined)
})
