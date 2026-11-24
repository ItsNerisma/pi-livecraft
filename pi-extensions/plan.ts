import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { isObject } from '../shared/is-object.ts'
import { PlanClock } from '../shared/plan-clock.ts'
import type { JsonObject } from '../shared/types.ts'
import {
  abandonsActivePlan,
  parsePlanArguments,
  parsePlanDetails,
  planAbandonedMessage,
  planMaximumSteps,
  planMinimumSteps,
  planSettleReminder,
  planStaleReminder,
  planStepStatuses,
  planStepTextLimit,
  type Plan,
} from '../shared/plan.ts'

const toolName = 'update_plan'
const reminderType = 'plan-reminder'

const rejectedPlanMessage =
  `The plan was rejected. Send the complete plan with ${planMinimumSteps}-${planMaximumSteps} steps, at most one in_progress, and at most ${planStepTextLimit} characters per step.`

/** One-line policy so adoption never depends on the model discovering the tool. */
const planPolicy =
  'The interface shows your plan live while you work. Commit a task that needs more than two tool calls with update_plan before your first action. Then keep it current: immediately after the tool call that finishes a step, call update_plan to mark that step completed and the step you start next in_progress. Never leave several transitions for one final call.'

/** Registers the tool that commits and updates the macro plan shown above the composer. */
export default function registerPlan(pi: ExtensionAPI): void {
  const clock = new PlanClock()
  /** Last plan Pi committed or resumed, so a settle knows whether it still tracks unfinished work. */
  let latest: Plan | undefined
  /** Tool calls since the last accepted plan: staleness decides the mid-run reminder. */
  let toolCallsSinceUpdate = 0
  /** One stale reminder per staleness episode, re-armed by each accepted update. */
  let staleReminded = false
  /** One settle reminder per run, so a model that ignores it cannot keep the run open. */
  let reminded = false

  /**
   * Restores the plan committed since the last user message, so a resumed session never treats
   * the previous task's plan as active, and accumulated timings survive without extra storage.
   */
  function restore(ctx: ExtensionContext): void {
    clock.restore()
    const entries = ctx.sessionManager.getBranch()
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      const message = entry.type === 'message' ? entry.message : undefined
      if (!isObject(message)) continue
      // A plan older than the last human message belongs to a finished task.
      if (isUserTaskMessage(message)) return
      if (message.role !== 'toolResult') continue
      if (message.toolName !== toolName || message.isError === true) continue
      const plan = parsePlanDetails(message.details)
      if (!plan) continue
      latest = plan
      clock.restore(plan)
      return
    }
  }

  /** A human message starts a new task; extension-authored custom messages keep the current one. */
  function isUserTaskMessage(message: JsonObject): boolean {
    return message.role === 'user' && message.customType === undefined
  }

  pi.on('agent_start', () => {
    clock.start(Date.now())
    toolCallsSinceUpdate = 0
    staleReminded = false
    reminded = false
  })
  pi.on('agent_settled', () => clock.settle(Date.now()))
  pi.on('session_start', (_event, ctx) => restore(ctx))
  // A human message ends the task the active plan tracks, matching the interface that hides it.
  pi.on('message_start', (event) => {
    if (isObject(event.message) && isUserTaskMessage(event.message)) latest = undefined
  })

  pi.on('tool_execution_end', (event) => {
    if (event.toolName !== toolName) toolCallsSinceUpdate += 1
  })

  // A busy turn forgets the plan it committed; one hidden reminder reports its actual state back
  // after enough tool calls without an update, so the model transitions it instead of abandoning it.
  pi.on('turn_end', (event) => {
    if (event.outcome !== 'completed' || event.toolResults.length === 0 || staleReminded) return
    const reminder = planStaleReminder(latest, toolCallsSinceUpdate)
    if (reminder === undefined) return
    staleReminded = true
    return {
      entries: [...event.entries, {
        type: 'custom_message' as const,
        customType: reminderType,
        content: reminder,
        display: false,
      }],
    }
  })

  // Pi would otherwise settle with the last step still in progress, leaving the panel paused
  // above a finished answer; one hidden reminder buys the model a request to close its plan.
  pi.on('agent_before_settle', (event) => {
    if (reminded || event.outcome !== 'completed') return
    const reminder = planSettleReminder(latest, toolCallsSinceUpdate)
    if (reminder === undefined) return
    reminded = true
    return {
      entries: [...event.entries, {
        type: 'custom_message' as const,
        customType: reminderType,
        content: reminder,
        display: false,
      }],
      continue: true,
    }
  })

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
      'Call update_plan before the first tool call of every task that needs more than two steps, and again immediately after the tool call that finishes each step.',
      'Mark a step in progress when you start it and completed when you finish it; never finish several steps in one final call.',
      'Never commit a different plan while the current one has unfinished steps: close it first by marking those steps completed or skipped, then commit the new plan separately.',
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
      // A different plan may not silently replace an unfinished one; the model must close it first.
      const previous = latest
      if (previous !== undefined && abandonsActivePlan(previous, plan)) {
        return {
          content: [{ type: 'text' as const, text: planAbandonedMessage(previous) }],
          details: undefined,
          isError: true,
        }
      }
      const now = Date.now()
      const { steps, activeMs } = clock.commit(plan.steps, now)
      // `details` reaches Pi Livecraft and stays out of the model context.
      const committed: Plan = { ...plan, activeMs, recordedAt: now, steps }
      latest = committed
      toolCallsSinceUpdate = 0
      staleReminded = false
      return {
        content: [{ type: 'text' as const, text: acknowledge(committed) }],
        details: committed,
      }
    },
  })
}

/** Echoes progress plus the step to work on next, so the model cannot drift into one final call. */
function acknowledge(plan: Plan): string {
  const done = plan
    .steps
    .filter(({ status }) => status === 'completed' || status === 'skipped')
    .length
  const current = plan.steps.find(({ status }) => status === 'in_progress')
  const next = plan.steps.find(({ status }) => status === 'pending')
  const progress = `Plan: ${done}/${plan.steps.length} steps done`
  const focus = current ?? next
  if (focus === undefined) return `${progress} · complete`
  return `${progress} · ${current ? 'now' : 'next'}: ${
    focus.text.slice(0, 60)
  } · update update_plan when this step changes`
}
