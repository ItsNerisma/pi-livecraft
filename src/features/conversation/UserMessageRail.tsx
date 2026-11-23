import { Tooltip } from '../../components/Tooltip.tsx'
import type { UserMessageAnchor } from './user-message-anchors.ts'
import './user-message-rail.css'

const PREVIEW_LIMIT = 240

/**
 * Marks on the thread gutter that reveal earlier user prompts.
 * Hovering previews the prompt; clicking scrolls the thread back to it.
 */
export function UserMessageRail(
  { anchors, onSelect }: {
    anchors: readonly UserMessageAnchor[]
    onSelect: (anchor: UserMessageAnchor) => void
  },
) {
  // Without a prompt there is nothing to navigate to.
  if (anchors.length === 0) return null
  return (
    <nav aria-label='User messages' className='user-message-rail'>
      {anchors.map((anchor, index) => {
        const time = formatTime(anchor.timestamp)
        const position = `User message ${index + 1} of ${anchors.length}`
        return (
          <Tooltip hint={time} key={anchor.key} label={previewLabel(anchor.preview)}>
            <button
              aria-label={time ? `${position}, ${time}` : position}
              className='user-message-rail-mark'
              onClick={() => onSelect(anchor)}
              type='button'
            >
              <span aria-hidden='true' />
            </button>
          </Tooltip>
        )
      })}
    </nav>
  )
}

function previewLabel(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT).trimEnd()}…` : text
}

function formatTime(timestamp: number | undefined): string | undefined {
  if (timestamp === undefined) return undefined
  const time = new Date(timestamp)
  if (Number.isNaN(time.getTime())) return undefined
  return time.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' })
}
