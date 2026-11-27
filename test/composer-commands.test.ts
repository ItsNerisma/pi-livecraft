import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ensureCompactCommand,
  isCommandDraft,
  isCompactCommandDraft,
  promptDelivery,
} from '../src/features/composer/composer-utils.ts'

test('delivers an interrupt as an abort before a plain prompt', () => {
  assert.deepEqual(promptDelivery('interrupt', true), { abort: true })
})

test('queues steer and follow-up through streamingBehavior', () => {
  assert.deepEqual(promptDelivery('steer', true), { abort: false, streamingBehavior: 'steer' })
  assert.deepEqual(promptDelivery('followUp', true), {
    abort: false,
    streamingBehavior: 'followUp',
  })
})

test('starts a plain run when Pi is idle, whatever the selected behavior', () => {
  for (const behavior of ['steer', 'interrupt', 'followUp'] as const) {
    assert.deepEqual(promptDelivery(behavior, false), { abort: false })
  }
})

test('detects only slash commands exposed by Pi', () => {
  const commands = [{ name: 'agent' }, { name: 'session-name' }]
  assert.equal(isCommandDraft('/agent frontend', commands), true)
  assert.equal(isCommandDraft('  /SESSION-NAME demo', commands), true)
  assert.equal(isCommandDraft('/unknown', commands), false)
  assert.equal(isCommandDraft('agent', commands), false)
})

test('detects /compact with no arguments', () => {
  assert.equal(isCompactCommandDraft('/compact'), true)
  assert.equal(isCompactCommandDraft('  /compact  '), true)
})

test('rejects /compact with trailing arguments', () => {
  assert.equal(isCompactCommandDraft('/compact foo'), false)
  assert.equal(isCompactCommandDraft('/compact '), true) // selectSlashCommand appends a space
})

test('rejects unrelated input', () => {
  assert.equal(isCompactCommandDraft(''), false)
  assert.equal(isCompactCommandDraft('/agent'), false)
  assert.equal(isCompactCommandDraft('compact'), false)
})

test('prepends compact command when absent', () => {
  const result = ensureCompactCommand([{ name: 'agent' }])
  assert.equal(result.length, 2)
  assert.equal(result[0].name, 'compact')
  assert.equal(result[1].name, 'agent')
})

test('does not duplicate compact command when Pi already exposes it', () => {
  const result = ensureCompactCommand([{ name: 'compact' }, { name: 'agent' }])
  assert.equal(result.length, 2)
  assert.equal(result[0].name, 'compact')
  assert.equal(result[1].name, 'agent')
})

test('handles empty command list', () => {
  const result = ensureCompactCommand([])
  assert.equal(result.length, 1)
  assert.equal(result[0].name, 'compact')
})
