import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parsePlanArguments,
  parsePlanDetails,
  planMaximumSteps,
  planMinimumSteps,
  planProtocol,
  planVersion,
  planStepTextLimit,
  type Plan,
} from '../shared/plan.ts'
import {
  planFromMessages,
  planIdentity,
  planState,
  planStateFromDetails,
} from '../src/features/plan/plan-state.ts'
import { toolCallPresentation } from '../src/features/conversation/tool-presentation.ts'

function planArguments(...statuses: Array<'pending' | 'in_progress' | 'completed' | 'skipped'>) {
  return {
    steps: statuses.map((status, index) => ({ text: `Step ${index + 1}`, status })),
  }
}

function planResult(details: unknown) {
  return {
    role: 'toolResult',
    toolCallId: 'call_1',
    toolName: 'update_plan',
    content: [{ type: 'text', text: 'Plan: 1/3 steps done' }],
    isError: false,
    details,
  }
}

test('parses a complete plan and trims step text', () => {
  const plan = parsePlanArguments({
    steps: [{ text: '  Read the docs  ', status: 'completed' }, {
      text: 'Edit',
      status: 'pending',
    }],
  })

  assert.equal(plan?.protocol, planProtocol)
  assert.equal(plan?.version, planVersion)
  assert.deepEqual(plan?.steps, [
    { text: 'Read the docs', status: 'completed' },
    { text: 'Edit', status: 'pending' },
  ])
})

test('rejects plans outside the step bounds and invalid steps', () => {
  const tooShort = parsePlanArguments(planArguments('pending'))
  const tooLong = parsePlanArguments(
    planArguments(...Array.from({ length: planMaximumSteps + 1 }, () => 'pending' as const)),
  )
  const twoCurrent = parsePlanArguments(planArguments('in_progress', 'in_progress'))
  const unknownStatus = parsePlanArguments({
    steps: [{ text: 'A', status: 'started' }, { text: 'B', status: 'pending' }],
  })
  const emptyText = parsePlanArguments({
    steps: [{ text: '   ', status: 'pending' }, { text: 'B', status: 'pending' }],
  })
  const longText = parsePlanArguments({
    steps: [
      { text: 'x'.repeat(planStepTextLimit + 1), status: 'pending' },
      { text: 'B', status: 'pending' },
    ],
  })

  assert.equal(tooShort, undefined)
  assert.equal(tooLong, undefined)
  assert.equal(twoCurrent, undefined)
  assert.equal(unknownStatus, undefined)
  assert.equal(emptyText, undefined)
  assert.equal(longText, undefined)
  assert.equal(parsePlanArguments(null), undefined)
  assert.equal(
    parsePlanArguments(
      planArguments(...Array.from({ length: planMinimumSteps }, () => 'pending' as const)),
    )
      ?.steps
      .length,
    planMinimumSteps,
  )
})

test('accepts only the versioned tool result payload', () => {
  const { steps } = planArguments('completed', 'in_progress')

  assert.equal(parsePlanDetails({ steps }), undefined)
  assert.equal(parsePlanDetails({ protocol: planProtocol, version: 2, steps }), undefined)
  assert.equal(
    parsePlanDetails({ protocol: planProtocol, version: planVersion, steps })?.steps.length,
    2,
  )
  assert.equal(
    planStateFromDetails({ protocol: planProtocol, version: planVersion, steps })?.done,
    1,
  )
})

test('summarizes progress, the current step, and completion', () => {
  const active = planState(
    parsePlanArguments(planArguments('completed', 'in_progress', 'pending')) as Plan,
  )
  const complete = planState(
    parsePlanArguments(planArguments('completed', 'skipped', 'completed')) as Plan,
  )

  assert.deepEqual(
    { done: active.done, total: active.total, current: active.current, complete: active.complete },
    { done: 1, total: 3, current: 'Step 2', complete: false },
  )
  assert.equal(complete.complete, true)
  assert.equal(complete.current, undefined)
})

test('identifies a plan by its steps so status changes keep the collapsed state', () => {
  const committed = planState(
    parsePlanArguments(planArguments('pending', 'pending')) as Plan,
  )
  const advanced = planState(
    parsePlanArguments(planArguments('completed', 'in_progress')) as Plan,
  )
  const replanned = planState(
    parsePlanArguments({
      steps: [{ text: 'A', status: 'pending' }, { text: 'C', status: 'pending' }],
    }) as Plan,
  )

  assert.equal(planIdentity(committed), planIdentity(advanced))
  assert.notEqual(planIdentity(committed), planIdentity(replanned))
})

test('reads the plan committed since the last user message', () => {
  const plan = parsePlanArguments(planArguments('completed', 'in_progress')) as Plan
  const committed = planState(plan)
  const details = { ...plan, protocol: planProtocol, version: planVersion }

  assert.deepEqual(
    planFromMessages([{ role: 'user', content: 'Go' }, planResult(details)])?.plan.steps,
    committed.plan.steps,
  )
  // A plan from an earlier turn no longer applies.
  assert.equal(
    planFromMessages([planResult(details), { role: 'user', content: 'Again' }]),
    undefined,
  )
  // A rejected call never replaces the last accepted plan.
  assert.deepEqual(
    planFromMessages([
      { role: 'user', content: 'Go' },
      planResult(details),
      { ...planResult(undefined), isError: true },
    ])
      ?.done,
    1,
  )
  // Unrelated tool results and malformed details are ignored.
  assert.equal(
    planFromMessages([
      { role: 'user', content: 'Go' },
      { ...planResult(undefined), toolName: 'bash', details: { text: 'ls' } },
    ]),
    undefined,
  )
})

test('describes a committed plan in the conversation thread', () => {
  const detailed = toolCallPresentation({
    id: 'call_1',
    name: 'update_plan',
    args: planArguments('completed', 'in_progress', 'pending'),
  })
  const invalid = toolCallPresentation({ id: 'call_2', name: 'update_plan', args: {} })

  assert.equal(detailed.headerDetail?.text, '1/3 · Step 2')
  assert.equal(detailed.headerDetail?.title, '1/3 · Step 2')
  assert.deepEqual(invalid, {})
})
