import type { ConversationMessage } from '../../../shared/types.ts'

export interface GoalReview {
  complete: boolean
  nextAction: string
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
