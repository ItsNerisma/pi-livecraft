import assert from 'node:assert/strict'
import test from 'node:test'
import { formatGoalEvidence, parseGoalReview } from '../src/features/composer/goal-mode.ts'

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
