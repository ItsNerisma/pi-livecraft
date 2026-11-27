import { diffWords } from 'diff'

export interface IntraLineSegment {
  text: string
  kind: 'added' | 'removed' | 'shared'
  /** False for the leading indentation of the first changed chunk, which stays unstyled. */
  highlighted?: boolean
}

/** Computes word-level diff segments with the same algorithm as Pi's edit renderer. */
export function intraLineDiff(oldText: string, newText: string): IntraLineSegment[] {
  const segments: IntraLineSegment[] = []
  let isFirstRemoved = true
  let isFirstAdded = true

  for (const part of diffWords(oldText, newText)) {
    const kind: IntraLineSegment['kind'] = part.removed
      ? 'removed'
      : part.added
      ? 'added'
      : 'shared'
    if (kind === 'shared') {
      segments.push({ text: part.value, kind })
      continue
    }

    const isFirst = kind === 'removed' ? isFirstRemoved : isFirstAdded
    if (kind === 'removed') isFirstRemoved = false
    else isFirstAdded = false
    if (!isFirst) {
      segments.push({ text: part.value, kind })
      continue
    }

    const leadingWhitespace = part.value.match(/^\s*/)?.[0] ?? ''
    if (leadingWhitespace) segments.push({ text: leadingWhitespace, kind, highlighted: false })
    const text = part.value.slice(leadingWhitespace.length)
    if (text) segments.push({ text, kind })
  }

  return segments
}
