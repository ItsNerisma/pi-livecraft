import { parsePlanTiming, serializePlanTiming, type PlanTiming } from './plan-state.ts'

const storagePrefix = 'pi-livecraft.plan-timing.'

/**
 * Active time the panel folded itself, kept across a reload. The payload in the session only knows
 * the work up to the last `update_plan` call, so a paused or running timer needs this copy.
 */
export function readPlanTiming(sessionId: string): PlanTiming | undefined {
  const value = window.localStorage.getItem(storagePrefix + sessionId)
  if (value === null) return undefined
  try {
    return parsePlanTiming(JSON.parse(value))
  } catch {
    return undefined
  }
}

export function writePlanTiming(sessionId: string, timing: PlanTiming): void {
  window.localStorage.setItem(
    storagePrefix + sessionId,
    JSON.stringify(serializePlanTiming(timing)),
  )
}

/** Forgets the folded time when a new turn starts, so a later plan never inherits it. */
export function clearPlanTiming(sessionId: string): void {
  window.localStorage.removeItem(storagePrefix + sessionId)
}
