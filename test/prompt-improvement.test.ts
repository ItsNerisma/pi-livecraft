import assert from 'node:assert/strict'
import test from 'node:test'
import {
  improvementDirectionInstruction,
  selectAvailableModel,
} from '../server/prompt-improvement.ts'

const supported = ['clarify', 'ideate', 'precise']

for (const key of supported) {
  test(`returns an instruction for "${key}"`, () => {
    const instruction = improvementDirectionInstruction(key)
    assert.ok(typeof instruction === 'string' && instruction.length > 0)
  })
}

const removed = ['actionable', 'debug', 'plan', 'concise', 'review']

for (const key of removed) {
  test(`returns undefined for removed preset "${key}"`, () => {
    assert.equal(improvementDirectionInstruction(key), undefined)
  })
}

test('returns undefined for an unknown key', () => {
  assert.equal(improvementDirectionInstruction('unknown'), undefined)
})

test('selects the preferred model when it is available', () => {
  const response = {
    data: {
      models: [
        {
          id: 'beam-free',
          provider: 'opencode-go',
          reasoning: true,
          cost: { input: 0, output: 0 },
        },
        {
          id: 'minimax-m3.1-flash',
          provider: 'opencode-go',
          reasoning: true,
          cost: { input: 0.15, output: 0.6 },
        },
      ],
    },
  }
  assert.deepEqual(
    selectAvailableModel(response, { provider: 'opencode-go', modelId: 'minimax-m3.1-flash' }),
    { id: 'minimax-m3.1-flash', provider: 'opencode-go' },
  )
})

test('falls back to the cheapest model when the preference is unavailable', () => {
  const response = {
    data: {
      models: [
        {
          id: 'minimax-m3.1-flash',
          provider: 'opencode-go',
          reasoning: true,
          cost: { input: 0.15, output: 0.6 },
        },
        {
          id: 'beam-free',
          provider: 'opencode-go',
          reasoning: true,
          cost: { input: 0, output: 0 },
        },
      ],
    },
  }
  assert.deepEqual(
    selectAvailableModel(response, { provider: 'missing', modelId: 'missing' }),
    { id: 'beam-free', provider: 'opencode-go' },
  )
})
