import { lazy, memo, Suspense, useMemo, type CSSProperties, type ReactNode } from 'react'
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter'
import { gitDiffBlocks, type GitDiffEntry, type GitDiffLine } from './git-diff.ts'

const LazyCodeHighlighter = lazy(() => import('../conversation/CodeHighlighter.tsx'))

type RendererProps = Parameters<NonNullable<SyntaxHighlighterProps['renderer']>>[0]
type Stylesheet = RendererProps['stylesheet']

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

/** Keeps the highlighter wrappers invisible so diff rows own the layout. */
const highlighterStyle: CSSProperties = {
  background: 'transparent',
  font: 'inherit',
  margin: 0,
  padding: 0,
  whiteSpace: 'normal',
}

/** Only languages registered by CodeHighlighter are listed; other files stay plain. */
const languageByExtension: Record<string, string> = {
  bash: 'bash',
  cjs: 'javascript',
  cs: 'csharp',
  css: 'css',
  htm: 'markup',
  html: 'markup',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  md: 'markdown',
  markdown: 'markdown',
  mjs: 'javascript',
  sh: 'bash',
  svg: 'markup',
  ts: 'typescript',
  tsx: 'typescript',
  xml: 'markup',
  zsh: 'bash',
}

/** Returns the highlighter language for a repository path, or undefined for plain text. */
function gitDiffLanguage(path: string): string | undefined {
  const extension = path.match(/\.([^./]+)$/)?.[1]?.toLowerCase()
  return extension ? languageByExtension[extension] : undefined
}

/** Renders parsed diff rows, coloring each hunk with the file's syntax. */
export const GitDiff = memo(function GitDiff(
  { entries, path }: { entries: GitDiffEntry[]; path: string },
) {
  const language = gitDiffLanguage(path)
  const blocks = useMemo(() => gitDiffBlocks(entries), [entries])
  if (entries.length === 0) return <p className='git-empty'>No textual differences to display.</p>

  return (
    <section className='git-diff' aria-label='File diff'>
      {blocks.map((block, index) => {
        if (block.kind === 'gap')
          return (
            <p className='git-diff-gap' key={index}>
              {block.count} unmodified line{block.count > 1 ? 's' : ''}
            </p>
          )

        const code = block.lines.map((line) => line.content).join('\n')
        if (!language) return <PlainDiffLines key={index} lines={block.lines} />
        return (
          <Suspense fallback={<PlainDiffLines lines={block.lines} />} key={index}>
            <LazyCodeHighlighter
              codeTagProps={{ style: { font: 'inherit', whiteSpace: 'normal' } }}
              customStyle={highlighterStyle}
              language={language}
              PreTag='div'
              CodeTag='div'
              renderer={(props: RendererProps) => renderDiffRows(props, block.lines)}
            >
              {code}
            </LazyCodeHighlighter>
          </Suspense>
        )
      })}
    </section>
  )
})

/** Maps the highlighter rows back to diff lines and composes syntax with word highlights. */
function renderDiffRows({ rows, stylesheet }: RendererProps, lines: GitDiffLine[]): ReactNode {
  if (rows.length !== lines.length) return <PlainDiffLines lines={lines} />

  const styleCache = new Map<string, CSSProperties | undefined>()
  return rows.map((row, index) => (
    <DiffLine key={index} line={lines[index]}>
      {renderLineContent(lines[index], syntaxTokens(row.children), stylesheet, styleCache)}
    </DiffLine>
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
  line: GitDiffLine,
  tokens: SyntaxToken[],
  stylesheet: Stylesheet,
  styles: Map<string, CSSProperties | undefined>,
): ReactNode {
  const highlighted = tokens.map((token) => token.text).join('')
  if (highlighted !== line.content && highlighted !== `${line.content}\n`) return plainContent(line)
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
        nodes.push(syntaxSpan(token, token.text, undefined, stylesheet, styles, `${tokenIndex}-0`))
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
      if (take <= 0) return plainContent(line)

      const text = token.text.slice(local, local + take)
      const changed = segment && segment.kind !== 'shared' ? segment.kind : undefined
      nodes.push(syntaxSpan(token, text, changed, stylesheet, styles, `${tokenIndex}-${local}`))
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
): ReactNode {
  return (
    <span
      className={changed ? `git-diff-token ${changed}` : undefined}
      key={key}
      style={syntaxStyle(token.classNames, stylesheet, styles)}
    >
      {text}
    </span>
  )
}

/** Renders one row with its gutter, sign, and highlighted content. */
function DiffLine({ children, line }: { children: ReactNode; line: GitDiffLine }) {
  return (
    <div className={`git-diff-line ${line.kind}`}>
      <span>{line.newLine ?? line.oldLine ?? ''}</span>
      <i aria-hidden='true'>
        {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
      </i>
      <code>{children}</code>
    </div>
  )
}

/** Fallback rows shown while the highlighter loads or for unsupported file types. */
function PlainDiffLines({ lines }: { lines: GitDiffLine[] }) {
  return (
    <>
      {lines.map((line, index) => <DiffLine key={index} line={line}>{plainContent(line)}
      </DiffLine>)}
    </>
  )
}

function plainContent(line: GitDiffLine): ReactNode {
  if (!line.segments?.length) return line.content || ' '
  return line.segments.map((segment, index) => (
    <span className={`git-diff-token ${segment.kind}`} key={index}>
      {segment
        .text}
    </span>
  ))
}
