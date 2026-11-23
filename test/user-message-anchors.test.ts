import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConversationMessageEntry } from '../src/features/conversation/message-reconciliation.ts'
import { userMessageAnchors } from '../src/features/conversation/user-message-anchors.ts'

test('maps history prompts to their rendered index with a single-line preview', () => {
  const entries: ConversationMessageEntry[] = [
    {
      key: 'history-1-0',
      message: {
        role: 'user',
        content: [{ type: 'text', text: '  Fix the\n scroll\nbehavior  ' }],
        timestamp: 1_700_000_000_000,
      },
      source: 'history',
      historyIndex: 0,
    },
    {
      key: 'history-2-1',
      message: { role: 'assistant', content: 'Done.' },
      source: 'history',
      historyIndex: 1,
    },
  ]

  assert.deepEqual(userMessageAnchors(entries), [
    {
      key: 'history-1-0',
      preview: 'Fix the scroll behavior',
      timestamp: 1_700_000_000_000,
      selector: '[data-message-index="0"]',
      highlight: 'message:0',
    },
  ])
})

test('targets live prompts by key and labels attachment-only messages', () => {
  const entries: ConversationMessageEntry[] = [
    {
      key: 'b6d1f0c4-0000-4000-8000-000000000000',
      message: { role: 'user', content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }] },
      source: 'live',
    },
  ]

  assert.deepEqual(userMessageAnchors(entries), [
    {
      key: 'b6d1f0c4-0000-4000-8000-000000000000',
      preview: 'Attachment',
      timestamp: undefined,
      selector: '[data-message-key="b6d1f0c4-0000-4000-8000-000000000000"]',
      highlight: 'live:b6d1f0c4-0000-4000-8000-000000000000',
    },
  ])
})

test('skips non-visible user messages', () => {
  const entries: ConversationMessageEntry[] = [
    {
      key: 'history-1-0',
      message: { role: 'user', content: '   ' },
      source: 'history',
      historyIndex: 0,
    },
    {
      key: 'system',
      message: { role: 'system', content: 'Ready.' },
      source: 'history',
      historyIndex: 1,
    },
  ]

  assert.deepEqual(userMessageAnchors(entries), [])
})
