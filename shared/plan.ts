import { isObject } from './is-object.ts'

export const planProtocol = 'pi-livecraft.plan'
export const planVersion = 1
export const planMinimumSteps = 2
export const planMaximumSteps = 8
export const planStepTextLimit = 120
export const planStepStatuses = ['pending', 'in_progress', 'completed', 'skipped'] as const

export type PlanStepStatus = (typeof planStepStatuses)[number]

/** A short imperative step the model committed for the current task. */
export interface PlanStep {
  text: string
  status: PlanStepStatus
  /** Active time Pi accumulated on this step; absent until the tool reports one. */
  activeMs?: number
}

/** The complete macro plan, replaced as a whole on every update. */
export interface Plan {
  protocol: typeof planProtocol
  version: typeof planVersion
  /** Active time Pi spent on the whole plan; absent until the tool reports one. */
  activeMs?: number
  /** Instant the reported `activeMs` values were accurate, in epoch milliseconds. */
  recordedAt?: number
  steps: PlanStep[]
}

/**
 * Validates the arguments of one `update_plan` call. The model always sends the whole plan, so an
 * update needs no identifier, merge rule, or previous state, and it never supplies timings.
 */
export function parsePlanArguments(value: unknown): Plan | undefined {
  return isObject(value) ? planFromSteps(value.steps, false) : undefined
}

/** Accepts only the versioned payload the plan tool writes into a tool result's `details`. */
export function parsePlanDetails(value: unknown): Plan | undefined {
  if (!isObject(value) || value.protocol !== planProtocol || value.version !== planVersion)
    return undefined
  const plan = planFromSteps(value.steps, true)
  if (!plan) return undefined
  const activeMs = activeTime(value.activeMs)
  const recordedAt = activeTime(value.recordedAt)
  return {
    ...plan,
    ...(activeMs === undefined ? {} : { activeMs }),
    ...(recordedAt === undefined ? {} : { recordedAt }),
  }
}

function planFromSteps(value: unknown, withActiveTime: boolean): Plan | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.length < planMinimumSteps || value.length > planMaximumSteps) return undefined
  const steps = value.map((step) => parseStep(step, withActiveTime))
  if (!steps.every((step): step is PlanStep => step !== undefined)) return undefined
  // A single step in progress keeps the panel unambiguous; the model batches its transitions.
  if (steps.filter(({ status }) => status === 'in_progress').length > 1) return undefined
  return { protocol: planProtocol, version: planVersion, steps }
}

function parseStep(value: unknown, withActiveTime: boolean): PlanStep | undefined {
  if (!isObject(value) || typeof value.text !== 'string' || !isPlanStepStatus(value.status))
    return undefined
  const text = value.text.trim()
  if (!text || text.length > planStepTextLimit) return undefined
  const activeMs = withActiveTime ? activeTime(value.activeMs) : undefined
  return activeMs === undefined
    ? { text, status: value.status }
    : { text, status: value.status, activeMs }
}

/** Ignores an unusable timing instead of hiding a plan the interface could otherwise show. */
function activeTime(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function isPlanStepStatus(value: unknown): value is PlanStepStatus {
  return typeof value === 'string' && planStepStatuses.includes(value as PlanStepStatus)
}

function isDone(step: PlanStep): boolean {
  return step.status === 'completed' || step.status === 'skipped'
}

/**
 * Reminder Pi receives when it is about to settle an unfinished plan it kept working on. Without
 * it the model often answers with the last step still in progress, and the interface can only show
 * that abandoned plan as paused once the work is actually done.
 */
export function planSettleReminder(
  plan: Plan | undefined,
  workedSinceUpdate: boolean,
): string | undefined {
  if (plan === undefined || !workedSinceUpdate) return undefined
  const done = plan.steps.filter(isDone).length
  if (done === plan.steps.length) return undefined
  const current = plan.steps.find(({ status }) => status === 'in_progress')
  const progress = `${done}/${plan.steps.length} steps done${
    current === undefined ? '' : `, with "${current.text}" in progress`
  }`
  return `Your plan still reads ${progress}, but you called tools after updating it. If the work is done, call update_plan once with the finished steps marked completed and skip the rest, then reply in one short line about the plan instead of repeating your answer. If you are waiting on the user, leave the plan as it is and say what you need.`
}
