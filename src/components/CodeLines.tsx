import { Fragment, lazy, Suspense, type CSSProperties, type ReactNode } from 'react'
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter'
import type { IntraLineSegment } from '../../shared/text-diff.ts'

const LazyCodeHighlighter = lazy(() => import('./CodeHighlighter.tsx'))

type RendererProps = Parameters<NonNullable<SyntaxHighlighterProps['renderer']>>[0]
type Stylesheet = RendererProps['stylesheet']

export interface CodeLine {
  content: string
  /** Word-level highlights computed by the caller for in-place replacements. */
  segments?: IntraLineSegment[]
}

interface CodeLinesProps<T extends CodeLine> {
  language: string | undefined
  lines: T[]
  /**
   * Renders one line. The component supplies the React key, so the returned
   * element does not need one.
   */
  renderLine: (line: T, content: ReactNode, index: number) => ReactNode
  /** Class for words changed by the intra-line diff; each caller owns its colors. */
  changedClassName: (kind: 'added' | 'removed') => string
}

interface SyntaxNode {
  type: 'element' | 'text'
  value?: string | number
  properties?: { className?: string[] }
  children?: SyntaxNode[]
}

interface SyntaxToken {
  classNames: string[]
  text: string
}

/** Keeps the highlighter wrappers invisible so callers own the line layout. */
const highlighterStyle: CSSProperties = {
  background: 'transparent',
  font: 'inherit',
  margin: 0,
  padding: 0,
  whiteSpace: 'normal',
}

/**
 * Renders code lines with optional syntax colors and word-level highlights.
 * A single highlighter pass covers the whole list, so multi-line constructs
 * stay colored; unsupported languages and the lazy-loading fallback render
 * the same rows without colors.
 */
export function CodeLines<T extends CodeLine>({
  changedClassName,
  language,
  lines,
  renderLine,
}: CodeLinesProps<T>) {
  const plainRows = () =>
    lines.map((line, index) => (
      <Fragment key={index}>
        {renderLine(line, plainContent(line, changedClassName), index)}
      </Fragment>
    ))

  if (!language) return plainRows()

  return (
    <Suspense fallback={plainRows()}>
      <LazyCodeHighlighter
        codeTagProps={{ style: { font: 'inherit', whiteSpace: 'normal' } }}
        customStyle={highlighterStyle}
        language={language}
        PreTag='div'
        CodeTag='div'
        renderer={(props: RendererProps) =>
          renderRows(props, lines, renderLine, changedClassName, plainRows)}
      >
        {lines.map((line) => line.content).join('\n')}
      </LazyCodeHighlighter>
    </Suspense>
  )
}

/** Maps the highlighter rows back to the caller's lines and composes highlights. */
function renderRows<T extends CodeLine>(
  { rows, stylesheet }: RendererProps,
  lines: T[],
  renderLine: CodeLinesProps<T>['renderLine'],
  changedClassName: CodeLinesProps<T>['changedClassName'],
  fallback: () => ReactNode,
): ReactNode {
  if (rows.length !== lines.length) return fallback()

  const styleCache = new Map<string, CSSProperties | undefined>()
  return rows.map((row, index) => (
    <Fragment key={index}>
      {renderLine(
        lines[index],
        renderLineContent(
          lines[index],
          syntaxTokens(row.children),
          stylesheet,
          styleCache,
          changedClassName,
        ),
        index,
      )}
    </Fragment>
  ))
}

/** Flattens the highlighter token tree into text chunks carrying their token classes. */
function syntaxTokens(nodes: SyntaxNode[] | undefined, inherited: string[] = []): SyntaxToken[] {
  if (!nodes) return []
  const tokens: SyntaxToken[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.value !== undefined && node.value !== '')
        tokens.push({ classNames: inherited, text: String(node.value) })
      continue
    }
    tokens.push(
      ...syntaxTokens(node.children, inherited.concat(node.properties?.className ?? [])),
    )
  }
  return tokens
}

/** Splits highlighted tokens where the intra-line diff starts and ends. */
function renderLineContent(
  line: CodeLine,
  tokens: SyntaxToken[],
  stylesheet: Stylesheet,
  styles: Map<string, CSSProperties | undefined>,
  changedClassName: (kind: 'added' | 'removed') => string,
): ReactNode {
  const highlighted = tokens.map((token) => token.text).join('')
  if (highlighted !== line.content && highlighted !== `${line.content}\n`)
    return plainContent(line, changedClassName)
  if (highlighted.endsWith('\n')) {
    const last = tokens[tokens.length - 1]
    tokens = [...tokens.slice(0, -1), { ...last, text: last.text.slice(0, -1) }]
  }

  const segments = line.segments?.length ? line.segments : null
  const nodes: ReactNode[] = []
  let segmentIndex = 0
  let segmentStart = 0
  let offset = 0

  for (const [tokenIndex, token] of tokens.entries()) {
    let local = 0
    while (local < token.text.length) {
      if (!segments) {
        nodes.push(
          syntaxSpan(
            token,
            token.text,
            undefined,
            stylesheet,
            styles,
            `${tokenIndex}-0`,
            changedClassName,
          ),
        )
        break
      }
      while (
        segmentIndex < segments.length
        && offset >= segmentStart + segments[segmentIndex].text.length
      ) {
        segmentStart += segments[segmentIndex].text.length
        segmentIndex += 1
      }
      const segment = segments[segmentIndex]
      const remaining = segment
        ? segmentStart + segment.text.length - offset
        : token.text.length - local
      const take = Math.min(token.text.length - local, remaining)
      if (take <= 0) return plainContent(line, changedClassName)

      const text = token.text.slice(local, local + take)
      const changed = segment && segment.kind !== 'shared' ? segment.kind : undefined
      nodes.push(
        syntaxSpan(
          token,
          text,
          changed,
          stylesheet,
          styles,
          `${tokenIndex}-${local}`,
          changedClassName,
        ),
      )
      local += take
      offset += take
    }
  }

  return nodes
}

/** Merges the theme styles of every token class applied to one text chunk. */
function syntaxStyle(
  classNames: string[],
  stylesheet: Stylesheet,
  cache: Map<string, CSSProperties | undefined>,
): CSSProperties | undefined {
  const key = classNames.join('.')
  if (cache.has(key)) return cache.get(key)

  let style: CSSProperties | undefined
  for (const className of classNames) {
    const tokenStyle = stylesheet[className]
    if (tokenStyle) style = { ...style, ...tokenStyle }
  }
  cache.set(key, style)
  return style
}

function syntaxSpan(
  token: SyntaxToken,
  text: string,
  changed: 'added' | 'removed' | undefined,
  stylesheet: Stylesheet,
  styles: Map<string, CSSProperties | undefined>,
  key: string,
  changedClassName: (kind: 'added' | 'removed') => string,
): ReactNode {
  return (
    <span
      className={changed ? changedClassName(changed) : undefined}
      key={key}
      style={syntaxStyle(token.classNames, stylesheet, styles)}
    >
      {text}
    </span>
  )
}

/** Renders the line without syntax colors, keeping word-level highlights. */
function plainContent(
  line: CodeLine,
  changedClassName: (kind: 'added' | 'removed') => string,
): ReactNode {
  if (!line.segments?.length) return line.content || ' '
  return line.segments.map((segment, index) =>
    segment.kind === 'shared'
      ? <Fragment key={index}>{segment.text}</Fragment>
      : <span className={changedClassName(segment.kind)} key={index}>{segment.text}</span>
  )
}
