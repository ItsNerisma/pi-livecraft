import { useEffect, useMemo, useState } from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'
import { planIdentity, type PlanState } from './plan-state.ts'
import type { PlanStepStatus } from '../../../shared/plan.ts'

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

/**
 * Shows the plan Pi committed for the current task. The panel stays collapsed for the plan the
 * user folded away and reopens when Pi replaces the plan with different steps.
 */
export function PlanPanel({ plan, running }: { plan: PlanState; running: boolean }) {
  const identity = useMemo(() => planIdentity(plan), [plan])
  const [collapsed, setCollapsed] = useState(() => readCollapsedPlan() === identity)

  useEffect(() => setCollapsed(readCollapsedPlan() === identity), [identity])

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
          <span className='plan-current'>{headline}</span>
          {paused && <span className='plan-note'>paused</span>}
        </button>
      </Tooltip>
      {!collapsed && (
        <ol className='plan-steps'>
          {plan.plan.steps.map((step, index) => (
            <li
              className='plan-step'
              data-status={step.status}
              key={`${index}:${step.text}`}
            >
              <span aria-hidden='true' className='plan-step-marker'>{markers[step.status]}</span>
              <span className='plan-step-text'>{step.text}</span>
              <span className='plan-step-status'>{statusLabels[step.status]}</span>
            </li>
          ))}
        </ol>
      )}
      <p aria-live='polite' className='plan-announcement'>{announcement}</p>
    </section>
  )
}

function readCollapsedPlan(): string | undefined {
  return window.localStorage.getItem(collapsedPlanKey) ?? undefined
}

function writeCollapsedPlan(identity: string | undefined): void {
  if (identity === undefined) window.localStorage.removeItem(collapsedPlanKey)
  else window.localStorage.setItem(collapsedPlanKey, identity)
}
