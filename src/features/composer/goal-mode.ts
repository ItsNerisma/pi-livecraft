import type { ConversationMessage } from '../../../shared/types.ts'
import { isObject } from '../../../shared/is-object.ts'

/** `pi-goal` event kinds that keep a goal alive; `cleared` and `complete` end it. */
export type GoalStatus = 'active' | 'paused' | 'budget_limited'

export interface GoalSnapshot {
  objective: string
  status: GoalStatus
}

/** True when the pi-goal extension registered its `/goal` command in this session. */
export function goalCommandAvailable(commands: Array<{ name?: unknown }>): boolean {
  return commands.some((command) => command.name === 'goal')
}

/**
 * Reads the goal pi-goal publishes. The extension emits visible `pi-goal-event` custom messages
 * whose `details` carry the goal state, so the active branch of the conversation is authoritative.
 */
export function readGoalState(messages: ConversationMessage[]): GoalSnapshot | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'custom' || message.customType !== 'pi-goal-event') continue
    const details = isObject(message.details) ? message.details : null
    if (!details) return null
    if (details.kind === 'cleared' || details.kind === 'complete') return null
    const goal = isObject(details.goal) ? details.goal : null
    const objective = goal && typeof goal.objective === 'string' ? goal.objective.trim() : ''
    if (!objective) return null
    return {
      objective,
      status: details.kind === 'paused'
        ? 'paused'
        : details.kind === 'budget_limited'
        ? 'budget_limited'
        : 'active',
    }
  }
  return null
}

/** Collapses a goal message onto one short line for the composer banner. */
export function goalSummary(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 160 ? `${line.slice(0, 157)}…` : line
}
