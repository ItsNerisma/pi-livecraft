import { isObject } from '../../../shared/is-object.ts'
import { parsePlanDetails, type Plan } from '../../../shared/plan.ts'
import type { JsonObject } from '../../../shared/types.ts'
import { toolResultInMessage } from '../conversation/tool-protocol.ts'

/** Names the Pi tool whose result carries the committed plan. */
export const updatePlanToolName = 'update_plan'

/** A committed plan with the progress values the panel and the tool card display. */
export interface PlanState {
  plan: Plan
  done: number
  total: number
  current?: string
  complete: boolean
}

/** Summarizes validated steps; skipped steps count as finished work. */
export function planState(plan: Plan): PlanState {
  const done = plan
    .steps
    .filter(({ status }) => status === 'completed' || status === 'skipped')
    .length
  const current = plan.steps.find(({ status }) => status === 'in_progress')?.text
  return {
    plan,
    done,
    total: plan.steps.length,
    ...(current ? { current } : {}),
    complete: done === plan.steps.length,
  }
}

/** Reads a plan from the versioned `details` of an `update_plan` result. */
export function planStateFromDetails(details: unknown): PlanState | undefined {
  const plan = parsePlanDetails(details)
  return plan ? planState(plan) : undefined
}

/**
 * Reads the plan committed since the last user message. Earlier plans belong to a finished turn,
 * and a rejected call never replaces the last accepted plan.
 */
export function planFromMessages(messages: JsonObject[]): PlanState | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isObject(message)) continue
    if (message.role === 'user') return undefined
    const result = toolResultInMessage(message)
    if (!result || result.toolName !== updatePlanToolName || result.isError) continue
    const state = planStateFromDetails(result.details)
    if (state) return state
  }
  return undefined
}

/** Identifies a plan by its steps, so a status change keeps the panel's collapsed state. */
export function planIdentity(state: PlanState): string {
  return state.plan.steps.map(({ text }) => text).join('\u0000')
}
