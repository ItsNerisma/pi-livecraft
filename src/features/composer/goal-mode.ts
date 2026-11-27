import type { ConversationMessage } from '../../../shared/types.ts'

export interface GoalReview {
  complete: boolean
  nextAction: string
}

export interface GoalDefinition {
  objective: string
  criteria: string
}

/** Extracts readable conversation evidence without passing image payloads to the reviewer. */
export function formatGoalEvidence(messages: ConversationMessage[]): string {
  return messages
    .slice(-16)
    .map((message) => {
      const role = typeof message.role === 'string' ? message.role : 'unknown'
      const content = message.content
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
        ? content
          .flatMap((part) => {
            if (typeof part === 'string') return [part]
            if (
              typeof part === 'object' && part !== null && 'text' in part
              && typeof part.text === 'string'
            ) return [part.text]
            return []
          })
          .join('\n')
        : ''
      return text ? `${role}: ${text.slice(0, 2_000)}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(-16_000)
}

/** Parses the completion contract extracted from the user's message; null when the model answered
 * something other than the requested JSON. */
export function parseGoalDefinition(response: string): GoalDefinition | null {
  const candidate = response.match(/\{[\s\S]*\}/)?.[0]
  if (!candidate) return null
  try {
    const value: unknown = JSON.parse(candidate)
    if (typeof value !== 'object' || value === null) return null
    if (!('objective' in value) || typeof value.objective !== 'string') return null
    const objective = value.objective.trim().slice(0, 2_000)
    if (!objective) return null
    const criteria = 'criteria' in value && typeof value.criteria === 'string'
      ? value.criteria.trim().slice(0, 2_000)
      : ''
    return { objective, criteria }
  } catch {
    return null
  }
}

/** Builds the short check-in sent after an incomplete review. The goal itself stays in the
 * conversation, so the reminder only carries the next action instead of restating the objective. */
export function formatGoalReminder(nextAction: string): string {
  const action = nextAction.trim() || 'Continue toward the goal and verify the result.'
  return `Goal check-in: not complete yet. Next: ${action}`
}

/** Collapses a goal message onto one short line for the composer banner. */
export function goalSummary(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 160 ? `${line.slice(0, 157)}…` : line
}

/** Parses a strict JSON verdict; malformed or ambiguous reviews must never trigger continuation. */
export function parseGoalReview(response: string): GoalReview | null {
  const candidate = response.match(/\{[\s\S]*\}/)?.[0]
  if (!candidate) return null
  try {
    const value: unknown = JSON.parse(candidate)
    if (typeof value !== 'object' || value === null) return null
    if (!('complete' in value) || typeof value.complete !== 'boolean') return null
    return {
      complete: value.complete,
      nextAction: 'nextAction' in value && typeof value.nextAction === 'string'
        ? value.nextAction.slice(0, 2_000)
        : '',
    }
  } catch {
    return null
  }
}
