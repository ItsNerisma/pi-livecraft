import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parsePlanArguments,
  parsePlanDetails,
  planMaximumSteps,
  planMinimumSteps,
  planProtocol,
  planSettleReminder,
  planVersion,
  planStepTextLimit,
  type Plan,
  type PlanStep,
  type PlanStepStatus,
} from '../shared/plan.ts'
import { PlanClock } from '../shared/plan-clock.ts'
import {
  formatPlanDuration,
  parsePlanTiming,
  parseStoredPlanTiming,
  planTickBase,
  planTiming,
  serializePlanTiming,
  type PlanTiming,
  planFromDisplayedConversation,
  planFromMessages,
  plansByTurnUsage,
  mergePlanHistory,
  planIdentity,
  planRunBase,
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

function planOf(...steps: PlanStep[]): Plan {
  return { protocol: planProtocol, version: planVersion, steps }
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

test('keeps each turn plan associated with its own final usage row', () => {
  const firstPlan = {
    ...planOf({ text: 'First task A', status: 'completed' }, {
      text: 'First task B',
      status: 'completed',
    }),
    activeMs: 10,
    recordedAt: 10,
  }
  const updatedFirstPlan = {
    ...planOf({ text: 'Revised task A', status: 'completed' }, {
      text: 'Revised task B',
      status: 'completed',
    }),
    activeMs: 20,
    recordedAt: 20,
  }
  const secondPlan = {
    ...planOf({ text: 'Second task A', status: 'completed' }, {
      text: 'Second task B',
      status: 'completed',
    }),
    activeMs: 30,
    recordedAt: 30,
  }
  const messages = [
    { role: 'user', content: 'First task' },
    planResult(firstPlan),
    planResult(updatedFirstPlan),
    { role: 'assistant', content: 'First task complete' },
    { role: 'user', content: 'Second task' },
    planResult(secondPlan),
    { role: 'assistant', content: 'Second task complete' },
  ]
  const plans = plansByTurnUsage(messages, new Set([3, 6]))

  assert.equal(plans.size, 2)
  assert.equal(plans.get(3)?.plan.steps[0]?.text, 'Revised task A')
  assert.equal(plans.get(6)?.plan.steps[0]?.text, 'Second task A')
})

test('retains known historical plans when a refresh omits their payload', () => {
  const knownPlan = planState(planOf(...stepList('completed', 'completed')))
  const history = new Map([[4, knownPlan]])

  assert.equal(mergePlanHistory(history, new Map()), history)
})

test('a snapshot that lags a sent message cannot resurrect the plan it ended', () => {
  const details = { ...planOf(...stepList('completed', 'completed')), activeMs: 0, recordedAt: 0 }
  const history = [{ role: 'user', content: 'Go' }, planResult(details)]
  const sentTurn = { id: 'live_1', message: { role: 'user', content: 'One more thing' } }

  // The refresh races the server recording the sent message, so the finished plan stays ended.
  assert.equal(planFromDisplayedConversation(history, [sentTurn]), undefined)
  // Once the snapshot catches up and the new turn commits its own plan, that plan shows.
  const replanned = { ...planOf(...stepList('pending', 'pending')), activeMs: 0, recordedAt: 1 }
  assert.deepEqual(
    planFromDisplayedConversation(
      [...history, sentTurn.message, planResult(replanned)],
      [sentTurn],
    )
      ?.plan
      .steps,
    planState(parsePlanDetails(replanned) as Plan).plan.steps,
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

test('reminds Pi to close an unfinished plan it kept working on before settling', () => {
  const plan = parsePlanArguments(planArguments('completed', 'in_progress', 'pending')) as Plan

  assert.equal(planSettleReminder(undefined, true), undefined)
  // A plan updated as the last action, or already closed, needs no reminder.
  assert.equal(planSettleReminder(plan, false), undefined)
  assert.equal(
    planSettleReminder(parsePlanArguments(planArguments('completed', 'skipped')) as Plan, true),
    undefined,
  )
  const reminder = planSettleReminder(plan, true) ?? ''
  assert.match(reminder, /1\/3 steps done/)
  assert.match(reminder, /"Step 2" in progress/)
  assert.match(reminder, /update_plan/)
})

test('reads reported active time from the tool result only', () => {
  const steps = stepList('completed', 'in_progress')
  const details = {
    protocol: planProtocol,
    version: planVersion,
    activeMs: 5_500,
    recordedAt: 1_000,
    steps: [{ ...steps[0], activeMs: 4_000 }, { ...steps[1], activeMs: 1_500 }],
  }

  const plan = parsePlanDetails(details)
  assert.equal(plan?.activeMs, 5_500)
  assert.equal(plan?.recordedAt, 1_000)
  assert.deepEqual(plan?.steps.map((step) => step.activeMs), [4_000, 1_500])

  // An unusable timing never hides a plan the interface can still show.
  const tolerant = parsePlanDetails({
    ...details,
    activeMs: 'soon',
    recordedAt: 'soon',
    steps: [
      { text: 'A', status: 'pending', activeMs: -5 },
      { text: 'B', status: 'pending', activeMs: 'long' },
    ],
  })
  assert.equal(tolerant?.activeMs, undefined)
  assert.equal(tolerant?.recordedAt, undefined)
  assert.deepEqual(tolerant?.steps.map((step) => step.activeMs), [undefined, undefined])

  // The model supplies no timings, even when it sends extra fields.
  const argumentsPlan = parsePlanArguments({
    activeMs: 9_999,
    steps: [
      { text: 'A', status: 'pending', activeMs: 9_999 },
      { text: 'B', status: 'pending' },
    ],
  })
  assert.equal(argumentsPlan?.activeMs, undefined)
  assert.deepEqual(argumentsPlan?.steps.map((step) => step.activeMs), [undefined, undefined])
})

test('bills only active time to the step that was running', () => {
  const clock = new PlanClock()
  clock.start(0)
  clock.commit(stepList('in_progress', 'pending'), 0)
  clock.settle(1_000)
  // One minute of waiting for the user is not billed to the step in progress.
  clock.start(61_000)
  const advanced = clock.commit(stepList('completed', 'in_progress'), 63_000)

  assert.deepEqual(advanced.steps.map((step) => step.activeMs), [3_000, undefined])

  clock.settle(63_500)
  const finished = clock.commit(stepList('completed', 'completed'), 64_000)

  // The half second between the settle and the next commit is not active time either.
  assert.deepEqual(finished.steps.map((step) => step.activeMs), [3_000, 500])
})

test('times the whole plan across pauses and freezes it once every step is done', () => {
  const clock = new PlanClock()
  clock.start(0)
  const opened = clock.commit(stepList('in_progress', 'pending'), 0)
  clock.settle(1_000)

  clock.start(61_000)
  const advanced = clock.commit(stepList('completed', 'in_progress'), 63_000)
  clock.settle(63_500)
  const finished = clock.commit(stepList('completed', 'completed'), 64_000)

  clock.start(70_000)
  clock.settle(90_000)
  const idle = clock.commit(stepList('completed', 'completed'), 95_000)

  assert.equal(opened.activeMs, 0)
  assert.equal(advanced.activeMs, 3_000)
  assert.equal(finished.activeMs, 3_500)
  // A finished plan stops counting even if the agent keeps running.
  assert.equal(idle.activeMs, 3_500)
})

test('restores timings from a resumed plan and drops the ones a step replacement removes', () => {
  const restored = new PlanClock()
  restored.restore(planOf(
    { text: 'A', status: 'completed', activeMs: 4_000 },
    { text: 'B', status: 'in_progress' },
  ))
  restored.start(1_000)

  const continued = restored.commit(stepList('completed', 'completed'), 3_000)

  assert.deepEqual(continued.steps.map((step) => step.activeMs), [4_000, 2_000])
  // Without a reported plan total, the restored steps keep the clock going.
  assert.equal(continued.activeMs, 6_000)

  const replanned = new PlanClock()
  replanned.restore(planOf(
    { text: 'A', status: 'completed', activeMs: 4_000 },
    { text: 'B', status: 'in_progress' },
  ))

  assert.deepEqual(
    replanned
      .commit([{ text: 'C', status: 'pending' }, { text: 'D', status: 'pending' }], 1_000)
      .steps
      .map((step) => step.activeMs),
    [undefined, undefined],
  )
})

test('restores the plan total and starts a fresh one for a different plan', () => {
  const restored = new PlanClock()
  restored.restore({
    ...planOf(
      { text: 'A', status: 'completed', activeMs: 4_000 },
      { text: 'B', status: 'in_progress' },
    ),
    activeMs: 5_000,
  })
  restored.start(1_000)

  assert.equal(restored.commit(stepList('completed', 'completed'), 3_000).activeMs, 7_000)

  const replanned = new PlanClock()
  replanned.restore({
    ...planOf(
      { text: 'A', status: 'completed', activeMs: 4_000 },
      { text: 'B', status: 'in_progress' },
    ),
    activeMs: 5_000,
  })
  replanned.start(1_000)
  const fresh = replanned.commit([
    { text: 'C', status: 'in_progress' },
    { text: 'D', status: 'pending' },
  ], 3_000)

  // The elapsed window belongs to the plan the new one replaces, so it starts from zero.
  assert.equal(fresh.activeMs, 0)
  assert.deepEqual(fresh.steps.map((step) => step.activeMs), [undefined, undefined])
})

test('starts a fresh total for a new task even when it reuses a step text', () => {
  const finished = () => {
    const clock = new PlanClock()
    clock.start(0)
    clock.commit([
      { text: 'Read', status: 'in_progress' },
      { text: 'Edit', status: 'pending' },
    ], 0)
    clock.settle(2_000)
    clock.start(2_500)
    clock.commit([
      { text: 'Read', status: 'completed' },
      { text: 'Edit', status: 'completed' },
    ], 2_500)
    clock.settle(3_000)
    return clock
  }

  // Reopening the finished plan keeps the clock it already accumulated.
  const reopened = finished().commit([
    { text: 'Read', status: 'completed' },
    { text: 'Edit', status: 'in_progress' },
  ], 10_000)
  assert.equal(reopened.activeMs, 2_000)

  // A new task that happens to reuse the same first step starts from zero.
  const next = finished().commit([
    { text: 'Read', status: 'pending' },
    { text: 'Ship', status: 'in_progress' },
  ], 10_000)
  assert.equal(next.activeMs, 0)
})

test('formats plan durations as a compact clock', () => {
  assert.equal(formatPlanDuration(0), '0s')
  assert.equal(formatPlanDuration(42_900), '42s')
  assert.equal(formatPlanDuration(187_000), '3:07')
  assert.equal(formatPlanDuration(3_600_000), '1:00:00')
  assert.equal(formatPlanDuration(3_729_000), '1:02:09')
})

test('keeps folded plan timing across a stale payload and resets for a new plan', () => {
  const running = planState(
    parsePlanArguments({
      steps: [{ text: 'A', status: 'completed' }, { text: 'B', status: 'in_progress' }],
    }) as Plan,
  )
  const folded: PlanTiming = {
    texts: ['A', 'B'],
    steps: new Map([['A', 4_000], ['B', 2_000]]),
    totalMs: 6_000,
    complete: false,
  }

  // A snapshot refresh can resend an older payload: the folded time must win.
  const merged = planTiming(running, folded)
  assert.equal(merged.steps.get('A'), 4_000)
  assert.equal(merged.steps.get('B'), 2_000)
  assert.equal(merged.totalMs, 6_000)

  // A finished plan that comes back with fresh steps is a new task, so timing restarts.
  const finished = planState(
    parsePlanArguments({
      steps: [{ text: 'A', status: 'completed' }, { text: 'B', status: 'completed' }],
    }) as Plan,
  )
  const restarted = planState(
    parsePlanArguments({
      steps: [{ text: 'A', status: 'pending' }, { text: 'B', status: 'pending' }],
    }) as Plan,
  )
  assert.equal(planTiming(restarted, planTiming(finished, folded)).totalMs, 0)

  // A plan that shares no step also starts from zero.
  const unrelated = planState(
    parsePlanArguments({
      steps: [{ text: 'C', status: 'pending' }, { text: 'D', status: 'pending' }],
    }) as Plan,
  )
  assert.equal(planTiming(unrelated, folded).totalMs, 0)
})

test('round-trips the timing kept across a reload and rejects a damaged entry', () => {
  const timing: PlanTiming = {
    texts: ['A', 'B'],
    steps: new Map([['A', 4_000], ['B', 1_500]]),
    totalMs: 5_500,
    complete: false,
  }
  const parsed = parsePlanTiming(serializePlanTiming(timing))

  assert.equal(parsed?.totalMs, 5_500)
  assert.deepEqual([...(parsed?.steps ?? new Map())], [['A', 4_000], ['B', 1_500]])
  assert.deepEqual(parsed?.texts, ['A', 'B'])
  assert.equal(parsed?.complete, false)
  assert.equal(
    parsePlanTiming({ texts: ['A'], steps: { A: -1 }, totalMs: 0, complete: false }),
    undefined,
  )
  assert.equal(parsePlanTiming({ texts: [1], steps: {}, totalMs: 0, complete: false }), undefined)
  assert.equal(parsePlanTiming('nope'), undefined)
})

test('resumes the live clock without re-counting restored time', () => {
  // Reload during a run after a save at 60s: the restored total already covers up to that instant.
  assert.equal(planTickBase(1_000, 60_000, 62_000), 60_000)
  // Without a restored timing, the payload instant is the base.
  assert.equal(planTickBase(1_000, undefined, 62_000), 1_000)
  // A future instant never counts time that has not happened yet.
  assert.equal(planTickBase(70_000, undefined, 62_000), 62_000)
  assert.equal(planTickBase(undefined, undefined, 62_000), 62_000)
})

test('follows the payload instant while running and never bills an idle wait', () => {
  // A panel mounted mid-run resumes at the later covered instant, like a reload.
  assert.equal(planRunBase(true, false, 8_000, 9_000, undefined, 10_000), 9_000)
  // While running the clock follows the payload instant its timings are accurate to, never
  // earlier than the base it already runs from, so a re-delivered payload cannot re-count
  // the window a restored timing covers.
  assert.equal(planRunBase(false, true, 9_500, 9_000, 9_000, 10_000), 9_500)
  assert.equal(planRunBase(false, true, 9_500, 9_000, 9_800, 10_000), 9_800)
  // A payload without timings keeps the previous base.
  assert.equal(planRunBase(false, true, undefined, 9_000, 9_200, 10_000), 9_200)
  // A run resumed after a pause starts fresh, so the idle wait is never billed to the plan.
  assert.equal(planRunBase(false, false, 8_000, 9_000, 8_000, 10_000), 10_000)
})

test('rejects a stored timing that has no usable save instant', () => {
  const timing = serializePlanTiming({
    texts: ['A', 'B'],
    steps: new Map([['A', 1_000], ['B', 0]]),
    totalMs: 1_000,
    complete: false,
  })

  assert.equal(parseStoredPlanTiming({ savedAt: 5, timing })?.savedAt, 5)
  assert.equal(parseStoredPlanTiming({ savedAt: 5, timing })?.timing.totalMs, 1_000)
  assert.equal(parseStoredPlanTiming({ timing }), undefined)
  assert.equal(parseStoredPlanTiming({ savedAt: 'now', timing }), undefined)
  assert.equal(parseStoredPlanTiming(null), undefined)
})
