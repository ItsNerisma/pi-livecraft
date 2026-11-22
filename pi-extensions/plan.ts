import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import {
  parsePlanArguments,
  planMaximumSteps,
  planMinimumSteps,
  planStepStatuses,
  planStepTextLimit,
  type Plan,
} from '../shared/plan.ts'

const rejectedPlanMessage =
  `The plan was rejected. Send the complete plan with ${planMinimumSteps}-${planMaximumSteps} steps, at most one in_progress, and at most ${planStepTextLimit} characters per step.`

/** Registers the tool that commits and updates the macro plan shown above the composer. */
export default function registerPlan(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'update_plan',
    label: 'Update Plan',
    description: 'Commit or replace the macro plan for the current task.',
    promptSnippet: 'Commit and update a macro plan for a multi-step task',
    promptGuidelines: [
      'Use update_plan once before starting a multi-step task, then only when a step starts or finishes; always send the complete plan.',
      `Keep update_plan to ${planMinimumSteps}-${planMaximumSteps} short steps and skip it for single-step requests.`,
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
      // `details` reaches Pi Livecraft and stays out of the model context.
      return { content: [{ type: 'text' as const, text: acknowledge(plan) }], details: plan }
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
