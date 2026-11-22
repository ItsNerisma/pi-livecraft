import type { Plan, PlanStep } from './plan.ts'

/** The committed steps and the plan-wide active time, both accurate at the same instant. */
export interface PlanTiming {
  steps: PlanStep[]
  activeMs: number
}

/**
 * Tracks active time per step and for the whole plan. Time accrues only between `start` and
 * `settle`, and the plan total stops once every step is done, so a run that ends and waits for the
 * user never bills that wait to the plan.
 */
export class PlanClock {
  #activeSince: number | undefined
  #runningStep: string | undefined
  #durations = new Map<string, number>()
  #texts: string[] = []
  #totalMs = 0
  #complete = false

  /** Reseeds from a restored plan so a resumed session continues its timings. */
  restore(plan?: Plan): void {
    this.#durations = plan ? timedSteps(plan.steps) : new Map()
    this.#texts = plan?.steps.map(({ text }) => text) ?? []
    this.#runningStep = plan ? runningStepText(plan.steps) : undefined
    this.#totalMs = plan?.activeMs ?? (plan ? sumDurations(plan.steps) : 0)
    this.#complete = plan ? isComplete(plan.steps) : false
    this.#activeSince = undefined
  }

  start(now: number): void {
    this.#activeSince = now
  }

  settle(now: number): void {
    this.#credit(now)
    this.#activeSince = undefined
  }

  /**
   * Credits the running step and the plan up to `now` and returns the committed plan with its
   * timings. A new task starts a fresh clock instead of inheriting the previous plan; a step whose
   * text changed is a new step, so its previous time is dropped with it.
   */
  commit(steps: PlanStep[], now: number): PlanTiming {
    const nextComplete = isComplete(steps)
    // Work done since the last update belongs to the plan as it stood when the update arrived.
    this.#credit(now, !this.#complete || !nextComplete)
    if (startsNewPlan(this.#texts, this.#complete, steps)) {
      this.#durations.clear()
      this.#totalMs = 0
    }
    const timed = steps.map((step) => {
      const activeMs = this.#durations.get(step.text)
      return activeMs === undefined ? step : { ...step, activeMs }
    })
    this.#durations = timedSteps(timed)
    this.#texts = timed.map(({ text }) => text)
    this.#runningStep = runningStepText(timed)
    this.#complete = nextComplete
    return { steps: timed, activeMs: this.#totalMs }
  }

  #credit(now: number, active = !this.#complete): void {
    if (this.#activeSince === undefined) return
    const elapsed = now - this.#activeSince
    this.#activeSince = now
    if (elapsed <= 0) return
    if (active) this.#totalMs += elapsed
    if (this.#runningStep === undefined) return
    this.#durations.set(this.#runningStep, (this.#durations.get(this.#runningStep) ?? 0) + elapsed)
  }
}

function sumDurations(steps: PlanStep[]): number {
  return steps.reduce((sum, step) => sum + (step.activeMs ?? 0), 0)
}

function timedSteps(steps: PlanStep[]): Map<string, number> {
  return new Map(
    steps.flatMap((step) =>
      step.activeMs === undefined ? [] : [[step.text, step.activeMs] as const]
    ),
  )
}

function runningStepText(steps: PlanStep[]): string | undefined {
  return steps.find(({ status }) => status === 'in_progress')?.text
}

function isComplete(steps: PlanStep[]): boolean {
  return steps.every(({ status }) => status === 'completed' || status === 'skipped')
}

/**
 * An update normally keeps most step texts. A new task either shares none of them or starts with
 * no finished step after a completed plan, so it must not inherit the previous clock.
 */
function startsNewPlan(
  previous: readonly string[],
  previousComplete: boolean,
  steps: PlanStep[],
): boolean {
  const sharesText = steps.some(({ text }) => previous.includes(text))
  if (!sharesText) return previous.length > 0
  const startsFresh = !steps.some(({ status }) => status === 'completed' || status === 'skipped')
  return previousComplete && startsFresh
}
