import { Tooltip } from '../../components/Tooltip.tsx'

/**
 * Sits above the composer while a pi-goal goal is armed or running: the short objective published
 * by the extension, its state, and the controls that belong to it.
 */
export function GoalBanner({ objective, status, onResume, onStop }: {
  objective: string
  status: string | null
  onResume?: () => void
  onStop: () => void
}) {
  return (
    <section aria-label='Goal mode' className='goal-banner'>
      <svg aria-hidden='true' viewBox='0 0 16 16'>
        <path d='M8 1.5 9.6 6.4 14.5 8l-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6L8 1.5Z' />
      </svg>
      <span className='goal-banner-title'>Goal</span>
      <span className='goal-banner-objective' title={objective}>
        {objective || 'Your next message sets the goal'}
      </span>
      {status && <span className='goal-banner-status'>{status}</span>}
      {onResume && (
        <button className='goal-banner-action' onClick={onResume} type='button'>
          Resume
        </button>
      )}
      <Tooltip label='Clear goal'>
        <button
          aria-label='Clear goal'
          className='goal-banner-stop'
          onClick={onStop}
          type='button'
        >
          ×
        </button>
      </Tooltip>
    </section>
  )
}
