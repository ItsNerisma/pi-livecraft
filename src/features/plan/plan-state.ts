import { isObject } from '../../../shared/is-object.ts'
import { parsePlanDetails, type Plan } from '../../../shared/plan.ts'
import type { JsonObject } from '../../../shared/types.ts'
import {
  conversationMessageEntries,
  type LiveMessage,
} from '../conversation/message-reconciliation.ts'
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

/** One-based ordinal of the active or next pending step, or the final step when complete. */
export function planCurrentStepNumber(state: PlanState): number {
  const activeIndex = state.plan.steps.findIndex(({ status }) => status === 'in_progress')
  if (activeIndex !== -1) return activeIndex + 1
  const pendingIndex = state.plan.steps.findIndex(({ status }) => status === 'pending')
  return pendingIndex === -1 ? state.total : pendingIndex + 1
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

/** Associates each task's last accepted plan with its final assistant usage row. */
export function plansByTurnUsage(
  messages: JsonObject[],
  usageMessageIndexes: ReadonlySet<number>,
): ReadonlyMap<number, PlanState> {
  const plans = new Map<number, PlanState>()
  let currentPlan: PlanState | undefined
  let latestUsageIndex: number | undefined
  const finishTurn = (): void => {
    if (currentPlan?.complete && latestUsageIndex !== undefined)
      plans.set(latestUsageIndex, currentPlan)
    currentPlan = undefined
    latestUsageIndex = undefined
  }

  messages.forEach((message, index) => {
    if (message.role === 'user') {
      finishTurn()
      return
    }
    const result = toolResultInMessage(message)
    if (result?.toolName === updatePlanToolName && !result.isError) {
      currentPlan = planStateFromDetails(result.details) ?? currentPlan
      // A plan committed after this usage row belongs to a response that has not settled yet.
      latestUsageIndex = undefined
    }
    if (usageMessageIndexes.has(index)) latestUsageIndex = index
  })
  finishTurn()
  return plans
}

/** Keeps known historical plans when an automatic snapshot temporarily omits their payload. */
export function mergePlanHistory(
  known: ReadonlyMap<number, PlanState>,
  refreshed: ReadonlyMap<number, PlanState>,
): ReadonlyMap<number, PlanState> {
  let changed = false
  const merged = new Map(known)
  for (const [index, plan] of refreshed) {
    if (merged.get(index) === plan) continue
    merged.set(index, plan)
    changed = true
  }
  return changed ? merged : known
}

/**
 * Reads the last accepted plan from the displayed conversation: the snapshot merged with the
 * optimistic turns still live in the interface. A refresh whose snapshot predates a just-sent
 * user message therefore cannot resurrect the plan that message ended, while a caught-up
 * snapshot shows the plan the new turn committed.
 */
export function planFromDisplayedConversation(
  historyMessages: JsonObject[],
  liveMessages: LiveMessage[],
): PlanState | undefined {
  return planFromMessages(
    conversationMessageEntries(historyMessages, liveMessages).map(({ message }) => message),
  )
}

/** Identifies a plan by its steps, so a status change keeps the panel's collapsed state. */
export function planIdentity(state: PlanState): string {
  return state.plan.steps.map(({ text }) => text).join('\u0000')
}

/** Active time the panel knows for one plan: its steps and the plan as a whole. */
export interface PlanTiming {
  texts: string[]
  steps: ReadonlyMap<string, number>
  totalMs: number
  complete: boolean
}

/**
 * Keeps the larger value while the plan shares a step with the previous one, so a stale payload or
 * a page reload never rewinds folded time, and resets to the reported timings for a new plan.
 */
export function planTiming(plan: PlanState, current?: PlanTiming): PlanTiming {
  const texts = plan.plan.steps.map(({ text }) => text)
  const previous = current && !startsNewPlan(current, plan) ? current : undefined
  const steps = new Map<string, number>()
  for (const step of plan.plan.steps) {
    const reported = step.activeMs ?? 0
    steps.set(
      step.text,
      previous ? Math.max(previous.steps.get(step.text) ?? 0, reported) : reported,
    )
  }
  const reportedTotal = plan.plan.activeMs
    ?? plan.plan.steps.reduce((sum, step) => sum + (step.activeMs ?? 0), 0)
  return {
    texts,
    steps,
    totalMs: previous ? Math.max(previous.totalMs, reportedTotal) : reportedTotal,
    complete: plan.complete,
  }
}

/** Serialises a timing for browser storage; `parsePlanTiming()` validates it back. */
export function serializePlanTiming(timing: PlanTiming): JsonObject {
  return {
    texts: timing.texts,
    steps: Object.fromEntries(timing.steps),
    totalMs: timing.totalMs,
    complete: timing.complete,
  }
}

/** Accepts only a well-formed stored timing; a damaged entry restarts the timers instead. */
export function parsePlanTiming(value: unknown): PlanTiming | undefined {
  if (!isObject(value) || !Array.isArray(value.texts) || !isObject(value.steps)) return undefined
  if (!isActiveTime(value.totalMs) || typeof value.complete !== 'boolean') return undefined
  const texts = value.texts.filter((text): text is string => typeof text === 'string')
  if (texts.length !== value.texts.length) return undefined
  const steps = new Map<string, number>()
  for (const [text, activeMs] of Object.entries(value.steps)) {
    if (!isActiveTime(activeMs)) return undefined
    steps.set(text, activeMs)
  }
  return { texts, steps, totalMs: value.totalMs, complete: value.complete }
}

/** The folded timing plus the instant it was accurate, so a reload never re-counts that window. */
export interface StoredPlanTiming {
  timing: PlanTiming
  savedAt: number
}

export function serializeStoredPlanTiming(timing: PlanTiming, savedAt: number): JsonObject {
  return { savedAt, timing: serializePlanTiming(timing) }
}

/** Rejects a damaged entry instead of showing invented time. */
export function parseStoredPlanTiming(value: unknown): StoredPlanTiming | undefined {
  if (!isObject(value) || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt))
    return undefined
  const timing = parsePlanTiming(value.timing)
  return timing ? { timing, savedAt: value.savedAt } : undefined
}

function startsNewPlan(current: PlanTiming, plan: PlanState): boolean {
  const sharesText = plan.plan.steps.some(({ text }) => current.texts.includes(text))
  if (!sharesText) return current.texts.length > 0
  const startsFresh = !plan.plan.steps.some(({ status }) =>
    status === 'completed' || status === 'skipped'
  )
  return current.complete && startsFresh
}

function isActiveTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * Instant the panel's live clock must start from. A restored timing already covers everything up to
 * its `savedAt`, so the tick continues from the later of that instant and the payload's
 * `recordedAt`; a future instant is clamped rather than counting time that has not happened.
 */
export function planTickBase(
  recordedAt: number | undefined,
  savedAt: number | undefined,
  now: number,
): number {
  return Math.min(Math.max(recordedAt ?? now, savedAt ?? 0), now)
}

/**
 * Instant the panel's live clock runs from. The first run of a mounted panel resumes at the
 * later of the restored save and the payload instants; a run resumed after a pause starts
 * fresh, so an idle wait is never billed; and a continuing run follows the later of the
 * payload's `recordedAt` and the base it already runs from — the instant its reported timings
 * are accurate to, never earlier, so a re-delivered payload or a dev double-mount cannot
 * re-count a window the restored timing already covers.
 */
export function planRunBase(
  first: boolean,
  runningBefore: boolean,
  recordedAt: number | undefined,
  savedAt: number | undefined,
  previousBase: number | undefined,
  now: number,
): number {
  if (first) return planTickBase(recordedAt, savedAt, now)
  if (!runningBefore) return now
  return Math.max(recordedAt ?? 0, previousBase ?? 0) || now
}

/** Formats a plan duration as `42s`, `3:07`, or `1:02:09` so a running timer stays short. */
export function formatPlanDuration(
  ms: number,
): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}:${twoDigits(seconds % 60)}`
  return `${Math.floor(minutes / 60)}:${twoDigits(minutes % 60)}:${twoDigits(seconds % 60)}`
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}
