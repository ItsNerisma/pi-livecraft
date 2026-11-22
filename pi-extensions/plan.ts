import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { isObject } from '../shared/is-object.ts'
import { PlanClock } from '../shared/plan-clock.ts'
import {
  parsePlanArguments,
  parsePlanDetails,
  planMaximumSteps,
  planMinimumSteps,
  planStepStatuses,
  planStepTextLimit,
  type Plan,
} from '../shared/plan.ts'

const toolName = 'update_plan'

const rejectedPlanMessage =
  `The plan was rejected. Send the complete plan with ${planMinimumSteps}-${planMaximumSteps} steps, at most one in_progress, and at most ${planStepTextLimit} characters per step.`

/** One-line policy so adoption never depends on the model discovering the tool. */
const planPolicy =
  'The interface shows your plan live while you work. Before the first action of a task that needs more than two tool calls, commit that plan with update_plan, then keep its steps current.'

/** Registers the tool that commits and updates the macro plan shown above the composer. */
export default function registerPlan(pi: ExtensionAPI): void {
  const clock = new PlanClock()

  /** Restores accumulated timings after a resume, reload, or fork without any extra storage. */
  function restore(ctx: ExtensionContext): void {
    clock.restore()
    const entries = ctx.sessionManager.getBranch()
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      const message = entry.type === 'message' ? entry.message : undefined
      if (!isObject(message) || message.role !== 'toolResult') continue
      if (message.toolName !== toolName || message.isError === true) continue
      const plan = parsePlanDetails(message.details)
      if (!plan) continue
      clock.restore(plan)
      return
    }
  }

  pi.on('agent_start', () => clock.start(Date.now()))
  pi.on('agent_settled', () => clock.settle(Date.now()))
  pi.on('session_start', (_event, ctx) => restore(ctx))

  pi.on('before_agent_start', (event) => {
    const options = event.systemPromptOptions
    if (!options) return
    options.sections = { ...options.sections, planning: planPolicy }
  })

  pi.registerTool({
    name: toolName,
    label: 'Update Plan',
    description: 'Commit the macro plan for the current task so the user can follow your steps.',
    promptSnippet: 'Commit and update the macro plan for the current task',
    promptGuidelines: [
      'Call update_plan before the first tool call of every task that needs more than two steps, then keep the plan current.',
      'Update update_plan when a step starts or finishes, never between steps, and always send the complete plan.',
      'Write every update_plan step in the language the user is writing in.',
      `Skip update_plan for a single-step request and for a follow-up that finishes the plan already committed. Send ${planMinimumSteps}-${planMaximumSteps} steps.`,
      'Keep each step text stable between updates so the interface can preserve its timing.',
    ],
    parameters: Type.Object({
      steps: Type.Array(Type.Object({
        text: Type.String(),
        status: Type.Union(planStepStatuses.map((status) => Type.Literal(status))),
      })),
    }),
    async execute(_toolCallId, params) {
      const plan = parsePlanArguments(params)
      if (!plan) {
        return {
          content: [{ type: 'text' as const, text: rejectedPlanMessage }],
          details: undefined,
          isError: true,
        }
      }
      const now = Date.now()
      const { steps, activeMs } = clock.commit(plan.steps, now)
      // `details` reaches Pi Livecraft and stays out of the model context.
      const committed: Plan = { ...plan, activeMs, recordedAt: now, steps }
      return {
        content: [{ type: 'text' as const, text: acknowledge(committed) }],
        details: committed,
      }
    },
  })
}

/** Echoes progress so the model never has to maintain its own count of finished steps. */
function acknowledge(plan: Plan): string {
  const done = plan
    .steps
    .filter(({ status }) => status === 'completed' || status === 'skipped')
    .length
  const current = plan.steps.find(({ status }) => status === 'in_progress')
  const progress = `Plan: ${done}/${plan.steps.length} steps done`
  if (!current) return progress
  return `${progress} · in progress: ${current.text.slice(0, 60)}`
}
