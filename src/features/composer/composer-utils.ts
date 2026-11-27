import type { JsonObject } from '../../../shared/types.ts'

/** Makes technical values readable in composer labels without changing RPC values. */
export function capitalizeLabel(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

export { isObject } from '../../../shared/is-object.ts'

export function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}

/** Returns true when the draft starts with a slash command exposed by Pi. */
export function isCommandDraft(text: string, commands: JsonObject[]): boolean {
  const name = /^\/([^\s]+)/.exec(text.trim())?.[1].toLowerCase()
  return name !== undefined
    && commands.some((command) => String(command.name).toLowerCase() === name)
}

/** Returns true when the trimmed draft is exactly the /compact slash command with no arguments. */
export function isCompactCommandDraft(text: string): boolean {
  return text.trim() === '/compact'
}

/** Prepends the local compact command when Pi does not already expose it in the snapshot. */
export function ensureCompactCommand(commands: JsonObject[]): JsonObject[] {
  return commands.some((cmd) => String(cmd.name).toLowerCase() === 'compact')
    ? commands
    : [{ name: 'compact' }, ...commands]
}

/** Inserts a transcript at the caret, spacing it away from the surrounding draft. */
export function insertTranscript(
  draft: string,
  transcript: string,
  start: number,
  end: number,
): { text: string; caret: number } {
  const dictation = transcript.trim()
  if (!dictation) return { text: draft, caret: end }
  const before = draft.slice(0, start)
  const after = draft.slice(end)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const trail = after && !/^\s/.test(after) ? ' ' : ''
  const text = `${before}${lead}${dictation}${trail}${after}`
  return { text, caret: before.length + lead.length + dictation.length }
}

/** Returns a short language code a recogniser accepts, or undefined for anything else. */
export function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  return /^[a-z]{2,3}$/.test(trimmed) ? trimmed : undefined
}

/** Restores the draft for one session from local storage. */
export function readComposerDraft(storageKey: string): string {
  try {
    const storage = (globalThis as typeof globalThis & {
      localStorage?: { getItem: (key: string) => string | null }
    })
      .localStorage
    return storage?.getItem(storageKey) ?? ''
  } catch {
    return ''
  }
}
