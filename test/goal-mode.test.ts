import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatGoalEvidence,
  formatGoalReminder,
  parseGoalDefinition,
  parseGoalReview,
} from '../src/features/composer/goal-mode.ts'

test('parses strict completion and continuation verdicts', () => {
  assert.deepEqual(parseGoalReview('{"complete":true,"nextAction":""}'), {
    complete: true,
    nextAction: '',
  })
  assert.deepEqual(parseGoalReview('```json\n{"complete":false,"nextAction":"Run tests"}\n```'), {
    complete: false,
    nextAction: 'Run tests',
  })
})

test('rejects ambiguous or malformed review output', () => {
  assert.equal(parseGoalReview('COMPLETE'), null)
  assert.equal(parseGoalReview('{"complete":"yes"}'), null)
  assert.equal(parseGoalReview('not json'), null)
})

test('parses the extracted completion contract', () => {
  assert.deepEqual(
    parseGoalDefinition('{"objective":"Ship the feature","criteria":"Tests pass"}'),
    { objective: 'Ship the feature', criteria: 'Tests pass' },
  )
  assert.deepEqual(parseGoalDefinition('{"objective":"  Fix the bug  "}'), {
    objective: 'Fix the bug',
    criteria: '',
  })
})

test('rejects an extraction without a usable objective', () => {
  assert.equal(parseGoalDefinition('{"criteria":"Tests pass"}'), null)
  assert.equal(parseGoalDefinition('{"objective":"   "}'), null)
  assert.equal(parseGoalDefinition('no contract'), null)
})

test('builds a short check-in that carries the next action only', () => {
  const reminder = formatGoalReminder('Run the focused tests')
  assert.equal(reminder, 'Goal check-in: not complete yet. Next: Run the focused tests')
  assert.equal(
    formatGoalReminder('  '),
    'Goal check-in: not complete yet. Next: Continue toward the goal and verify the result.',
  )
})

test('formats recent text evidence and excludes image payloads', () => {
  const evidence = formatGoalEvidence([
    {
      role: 'user',
      content: [{ type: 'text', text: 'Do the task' }, { type: 'image', data: 'secret' }],
    },
    { role: 'assistant', content: 'Done' },
  ])
  assert.match(evidence, /user: Do the task/)
  assert.match(evidence, /assistant: Done/)
  assert.doesNotMatch(evidence, /secret/)
})
