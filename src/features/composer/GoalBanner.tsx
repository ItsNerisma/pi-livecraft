import { Tooltip } from '../../components/Tooltip.tsx'

/**
 * Sits above the composer while a goal is armed: the short objective, its verification state,
 * and a way out. The full goal text stays in the conversation, never in this bar.
 */
export function GoalBanner({ objective, status, onStop }: {
  objective: string
  status: string | null
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
      <Tooltip label='Stop goal mode'>
        <button
          aria-label='Stop goal mode'
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
