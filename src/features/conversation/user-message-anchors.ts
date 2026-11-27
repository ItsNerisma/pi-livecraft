import { isVisibleConversationMessage, messageText } from './message-display.ts'
import type { ConversationMessageEntry } from './message-reconciliation.ts'

/** A user prompt the thread rail can preview and reveal. */
export interface UserMessageAnchor {
  /** Stable React key for the rail mark. */
  key: string
  /** Single-line prompt text, or a label when the message only carries attachments. */
  preview: string
  timestamp?: number
  /** First history index to mount if this prompt is not yet rendered. */
  historyIndex?: number
  /** Selector of the rendered thread entry, used to scroll back to the prompt. */
  selector: string
  /** Highlight key shared with thread navigation. */
  highlight: string
}

const ATTACHMENT_PREVIEW = 'Attachment'

/**
 * Lists every user prompt in thread order with the selector needed to reveal it.
 * Live entries are targeted by key because they have no history index until Pi reports them.
 */
export function userMessageAnchors(
  entries: readonly ConversationMessageEntry[],
): UserMessageAnchor[] {
  return entries.flatMap((entry) => {
    const { message } = entry
    if (message.role !== 'user' || !isVisibleConversationMessage(message)) return []
    const timestamp = typeof message.timestamp === 'number' ? message.timestamp : undefined
    return [{
      key: entry.key,
      preview: messageText(message.content).replace(/\s+/g, ' ').trim() || ATTACHMENT_PREVIEW,
      timestamp,
      ...(entry.source === 'history' ? { historyIndex: entry.historyIndex } : {}),
      selector: entry.source === 'history'
        ? `[data-message-index="${entry.historyIndex}"]`
        : `[data-message-key="${entry.key}"]`,
      highlight: entry.source === 'history' ? `message:${entry.historyIndex}` : `live:${entry.key}`,
    }]
  })
}
