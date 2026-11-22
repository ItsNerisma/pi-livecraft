import type { PlanStep } from './plan.ts'

/**
 * Tracks active planning time per step. Time accrues only between `start` and `settle`, so a run
 * that ends and waits for the user never bills that wait to a step.
 */
export class PlanClock {
  #activeSince: number | undefined
  #runningStep: string | undefined
  #durations = new Map<string, number>()

  /** Reseeds from a restored plan so a resumed session continues its timings. */
  restore(steps: PlanStep[]): void {
    this.#durations = timedSteps(steps)
    this.#runningStep = runningStepText(steps)
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
   * Credits the running step up to `now` and returns the committed plan with its timings. A step
   * whose text changed is a new step, so its previous time is dropped with it.
   */
  commit(steps: PlanStep[], now: number): PlanStep[] {
    this.#credit(now)
    const timed = steps.map((step) => {
      const activeMs = this.#durations.get(step.text)
      return activeMs === undefined ? step : { ...step, activeMs }
    })
    this.#durations = timedSteps(timed)
    this.#runningStep = runningStepText(timed)
    return timed
  }

  #credit(now: number): void {
    if (this.#activeSince === undefined) return
    const elapsed = now - this.#activeSince
    this.#activeSince = now
    if (this.#runningStep === undefined || elapsed <= 0) return
    this.#durations.set(this.#runningStep, (this.#durations.get(this.#runningStep) ?? 0) + elapsed)
  }
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
