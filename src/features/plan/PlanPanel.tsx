import { useEffect, useMemo, useState } from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'
import { formatPlanDuration, planIdentity, type PlanState } from './plan-state.ts'
import type { PlanStep, PlanStepStatus } from '../../../shared/plan.ts'

const collapsedPlanKey = 'pi-livecraft.plan-collapsed'

const markers: Record<PlanStepStatus, string> = {
  pending: '○',
  in_progress: '●',
  completed: '✓',
  skipped: '–',
}

const statusLabels: Record<PlanStepStatus, string> = {
  pending: 'pending',
  in_progress: 'in progress',
  completed: 'completed',
  skipped: 'skipped',
}

/** Active time the panel knows for one plan: its steps and the plan as a whole. */
interface PlanTiming {
  texts: string[]
  steps: ReadonlyMap<string, number>
  totalMs: number
  complete: boolean
}

/**
 * Shows the plan Pi committed for the current task. The panel stays collapsed for the plan the
 * user folded away and reopens when Pi replaces the plan with different steps.
 */
export function PlanPanel({ plan, running }: { plan: PlanState; running: boolean }) {
  const identity = useMemo(() => planIdentity(plan), [plan])
  const [collapsed, setCollapsed] = useState(() => readCollapsedPlan() === identity)
  const [now, setNow] = useState(() => Date.now())
  const [timing, setTiming] = useState<PlanTiming>(() => planTiming(plan))
  const [activeSince, setActiveSince] = useState<number | undefined>()

  useEffect(() => setCollapsed(readCollapsedPlan() === identity), [identity])

  // Merge instead of replace: a snapshot refresh can resend a payload older than folded time.
  useEffect(() => {
    setTiming((current) => planTiming(plan, current))
    setNow(Date.now())
  }, [plan])

  // Run the clock only while Pi works; fold the live window into the plan and its current step.
  useEffect(() => {
    if (!running) return
    const startedAt = Date.now()
    setActiveSince(startedAt)
    setNow(startedAt)
    return () => {
      const elapsed = Date.now() - startedAt
      setActiveSince(undefined)
      if (elapsed <= 0) return
      const step = plan.plan.steps.find(({ status }) => status === 'in_progress')?.text
      setTiming((current) => {
        const steps = new Map(current.steps)
        if (step !== undefined && !plan.complete)
          steps.set(step, (steps.get(step) ?? 0) + elapsed)
        return {
          texts: current.texts,
          steps,
          totalMs: plan.complete ? current.totalMs : current.totalMs + elapsed,
          complete: current.complete,
        }
      })
    }
  }, [running, plan])

  // The total keeps running while agents work on an unfinished plan, even between two steps.
  const ticking = running && !plan.complete
  useEffect(() => {
    if (!ticking) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [ticking])

  const live = activeSince === undefined ? 0 : Math.max(0, now - activeSince)
  const durationOf = (step: PlanStep): number =>
    (timing.steps.get(step.text) ?? 0) + (step.status === 'in_progress' ? live : 0)
  const total = timing.totalMs + (running && !plan.complete ? live : 0)

  const toggle = (): void => {
    const next = !collapsed
    writeCollapsedPlan(next ? identity : undefined)
    setCollapsed(next)
  }

  const pending = plan.plan.steps.find(({ status }) => status === 'pending')?.text
  const headline = plan.complete ? 'All steps done' : plan.current ?? pending ?? 'Working'
  const paused = !running && !plan.complete
  const announcement = [
    `Plan: ${plan.done} of ${plan.total} steps done.`,
    plan.current ? `In progress: ${plan.current}.` : '',
    plan.complete ? 'All steps done.' : '',
    paused ? 'Pi is not working on this plan right now.' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      aria-label='Task plan'
      className={`plan-panel${collapsed ? ' is-collapsed' : ''}${
        plan.complete ? ' is-complete' : ''
      }`}
    >
      <Tooltip
        label={`Plan: ${plan.done}/${plan.total} steps done${
          plan.complete ? '' : `\nIn progress: ${plan.current ?? 'waiting for the next step'}`
        }`}
      >
        <button aria-expanded={!collapsed} className='plan-heading' onClick={toggle} type='button'>
          <span aria-hidden='true' className='plan-caret'>▾</span>
          <span className='plan-title'>Plan</span>
          <span className='plan-progress'>{plan.done}/{plan.total}</span>
          <span aria-label={`${formatPlanDuration(total)} of active time`} className='plan-total'>
            {formatPlanDuration(total)}
          </span>
          <span className='plan-current'>{headline}</span>
          {paused && <span className='plan-note'>paused</span>}
        </button>
      </Tooltip>
      {!collapsed && (
        <ol className='plan-steps'>
          {plan.plan.steps.map((step, index) => {
            const duration = durationOf(step)
            const timed = duration > 0 || step.activeMs !== undefined
              || step.status === 'in_progress'
            return (
              <li
                className='plan-step'
                data-status={step.status}
                key={`${index}:${step.text}`}
              >
                <span aria-hidden='true' className='plan-step-marker'>{markers[step.status]}</span>
                <span className='plan-step-text'>{step.text}</span>
                {timed && (
                  <span className='plan-step-duration'>{formatPlanDuration(duration)}</span>
                )}
                <span className='plan-step-status'>{statusLabels[step.status]}</span>
              </li>
            )
          })}
        </ol>
      )}
      <p aria-live='polite' className='plan-announcement'>{announcement}</p>
    </section>
  )
}

function readCollapsedPlan(): string | undefined {
  return window.localStorage.getItem(collapsedPlanKey) ?? undefined
}

/**
 * Keeps the larger value while the plan shares a step with the previous one, so a stale payload
 * never rewinds folded time, and resets to the reported timings when Pi commits a new plan.
 */
function planTiming(plan: PlanState, current?: PlanTiming): PlanTiming {
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

function startsNewPlan(current: PlanTiming, plan: PlanState): boolean {
  const sharesText = plan.plan.steps.some(({ text }) => current.texts.includes(text))
  if (!sharesText) return current.texts.length > 0
  const startsFresh = !plan.plan.steps.some(({ status }) =>
    status === 'completed' || status === 'skipped'
  )
  return current.complete && startsFresh
}

function writeCollapsedPlan(identity: string | undefined): void {
  if (identity === undefined) window.localStorage.removeItem(collapsedPlanKey)
  else window.localStorage.setItem(collapsedPlanKey, identity)
}
