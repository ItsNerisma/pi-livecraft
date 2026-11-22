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
  type PlanStep,
  type PlanStepStatus,
} from '../shared/plan.ts'
import { PlanClock } from '../shared/plan-clock.ts'
import {
  formatPlanDuration,
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

function stepList(...statuses: PlanStepStatus[]): PlanStep[] {
  return statuses.map((status, index) => ({ text: String.fromCharCode(65 + index), status }))
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

test('reads reported active time from the tool result only', () => {
  const steps = stepList('completed', 'in_progress')
  const details = {
    protocol: planProtocol,
    version: planVersion,
    recordedAt: 1_000,
    steps: [{ ...steps[0], activeMs: 4_000 }, { ...steps[1], activeMs: 1_500 }],
  }

  const plan = parsePlanDetails(details)
  assert.equal(plan?.recordedAt, 1_000)
  assert.deepEqual(plan?.steps.map((step) => step.activeMs), [4_000, 1_500])

  // An unusable timing never hides a plan the interface can still show.
  const tolerant = parsePlanDetails({
    ...details,
    recordedAt: 'soon',
    steps: [
      { text: 'A', status: 'pending', activeMs: -5 },
      { text: 'B', status: 'pending', activeMs: 'long' },
    ],
  })
  assert.equal(tolerant?.recordedAt, undefined)
  assert.deepEqual(tolerant?.steps.map((step) => step.activeMs), [undefined, undefined])

  // The model supplies no timings, even when it sends extra fields.
  assert.deepEqual(
    parsePlanArguments({
      steps: [
        { text: 'A', status: 'pending', activeMs: 9_999 },
        { text: 'B', status: 'pending' },
      ],
    })
      ?.steps
      .map((step) => step.activeMs),
    [undefined, undefined],
  )
})

test('bills only active time to the step that was running', () => {
  const clock = new PlanClock()
  clock.start(0)
  clock.commit(stepList('in_progress', 'pending'), 0)
  clock.settle(1_000)
  // One minute of waiting for the user is not billed to the step in progress.
  clock.start(61_000)
  const advanced = clock.commit(stepList('completed', 'in_progress'), 63_000)

  assert.deepEqual(advanced.map((step) => step.activeMs), [3_000, undefined])

  clock.settle(63_500)
  const finished = clock.commit(stepList('completed', 'completed'), 64_000)

  // The half second between the settle and the next commit is not active time either.
  assert.deepEqual(finished.map((step) => step.activeMs), [3_000, 500])
})

test('restores timings from a resumed plan and drops the ones a step replacement removes', () => {
  const restored = new PlanClock()
  restored.restore([
    { text: 'A', status: 'completed', activeMs: 4_000 },
    { text: 'B', status: 'in_progress' },
  ])
  restored.start(1_000)

  assert.deepEqual(
    restored.commit(stepList('completed', 'completed'), 3_000).map((step) => step.activeMs),
    [4_000, 2_000],
  )

  const replanned = new PlanClock()
  replanned.restore([
    { text: 'A', status: 'completed', activeMs: 4_000 },
    { text: 'B', status: 'in_progress' },
  ])

  assert.deepEqual(
    replanned
      .commit([{ text: 'C', status: 'pending' }, { text: 'D', status: 'pending' }], 1_000)
      .map((step) => step.activeMs),
    [undefined, undefined],
  )
})

test('formats plan durations as a compact clock', () => {
  assert.equal(formatPlanDuration(0), '0s')
  assert.equal(formatPlanDuration(42_900), '42s')
  assert.equal(formatPlanDuration(187_000), '3:07')
  assert.equal(formatPlanDuration(3_600_000), '1:00:00')
  assert.equal(formatPlanDuration(3_729_000), '1:02:09')
})
