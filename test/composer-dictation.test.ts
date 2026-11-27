import assert from 'node:assert/strict'
import test from 'node:test'
import { insertTranscript, normalizeLanguage } from '../src/features/composer/composer-utils.ts'

test('appends a transcript with one separating space', () => {
  assert.deepEqual(insertTranscript('Fix the bug', 'in the composer', 11, 11), {
    text: 'Fix the bug in the composer',
    caret: 27,
  })
})

test('keeps the draft spacing when the caret already follows a space', () => {
  assert.deepEqual(insertTranscript('Fix ', 'the bug', 4, 4), {
    text: 'Fix the bug',
    caret: 11,
  })
})

test('inserts at the start without leading whitespace', () => {
  assert.deepEqual(insertTranscript('composer', 'Refactor the', 0, 0), {
    text: 'Refactor the composer',
    caret: 12,
  })
})

test('replaces the selected range and keeps the following word separated', () => {
  assert.deepEqual(insertTranscript('Fix this bug', 'that', 4, 8), {
    text: 'Fix that bug',
    caret: 8,
  })
})

test('inserts into an empty draft without surrounding spaces', () => {
  assert.deepEqual(insertTranscript('', 'Hello', 0, 0), { text: 'Hello', caret: 5 })
})

test('ignores a blank transcript and keeps the draft untouched', () => {
  assert.deepEqual(insertTranscript('Draft', '   ', 5, 5), { text: 'Draft', caret: 5 })
})

test('normalizes a supported language code', () => {
  assert.equal(normalizeLanguage(' FR '), 'fr')
  assert.equal(normalizeLanguage('yue'), 'yue')
})

test('rejects a language the recogniser cannot use', () => {
  assert.equal(normalizeLanguage('french'), undefined)
  assert.equal(normalizeLanguage('x'), undefined)
  assert.equal(normalizeLanguage(42), undefined)
})
