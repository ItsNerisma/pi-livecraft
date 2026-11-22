import { parsePlanArguments } from '../../../../shared/plan.ts'
import { planState } from '../../plan/plan-state.ts'
import { truncateToolText, type ToolCallPresentation } from './shared.ts'

/** Summarizes a committed plan as progress plus the step currently in progress. */
export function planPresentation(args: unknown): ToolCallPresentation {
  const plan = parsePlanArguments(args)
  if (!plan) return {}

  const state = planState(plan)
  const detail = `${state.done}/${state.total} · ${
    state.complete ? 'complete' : state.current ?? 'next step'
  }`
  return { headerDetail: { text: truncateToolText(detail, 80).text, title: detail } }
}
