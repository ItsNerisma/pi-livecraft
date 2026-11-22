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
}

/** The complete macro plan, replaced as a whole on every update. */
export interface Plan {
  protocol: typeof planProtocol
  version: typeof planVersion
  steps: PlanStep[]
}

/**
 * Validates the arguments of one `update_plan` call. The model always sends the whole plan, so an
 * update needs no identifier, merge rule, or previous state.
 */
export function parsePlanArguments(value: unknown): Plan | undefined {
  return isObject(value) ? planFromSteps(value.steps) : undefined
}

/** Accepts only the versioned payload the plan tool writes into a tool result's `details`. */
export function parsePlanDetails(value: unknown): Plan | undefined {
  if (!isObject(value) || value.protocol !== planProtocol || value.version !== planVersion)
    return undefined
  return planFromSteps(value.steps)
}

function planFromSteps(value: unknown): Plan | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.length < planMinimumSteps || value.length > planMaximumSteps) return undefined
  const steps = value.map(parseStep)
  if (!steps.every((step): step is PlanStep => step !== undefined)) return undefined
  // A single step in progress keeps the panel unambiguous; the model batches its transitions.
  if (steps.filter(({ status }) => status === 'in_progress').length > 1) return undefined
  return { protocol: planProtocol, version: planVersion, steps }
}

function parseStep(value: unknown): PlanStep | undefined {
  if (!isObject(value) || typeof value.text !== 'string' || !isPlanStepStatus(value.status))
    return undefined
  const text = value.text.trim()
  if (!text || text.length > planStepTextLimit) return undefined
  return { text, status: value.status }
}

function isPlanStepStatus(value: unknown): value is PlanStepStatus {
  return typeof value === 'string' && planStepStatuses.includes(value as PlanStepStatus)
}
