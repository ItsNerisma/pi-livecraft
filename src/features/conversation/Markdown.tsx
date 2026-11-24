import { lazy, memo, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CopyablePre } from './CodeBlock.tsx'
import { parseMarkdownFrontmatter } from './markdown-frontmatter.ts'

const LazyCodeHighlighter = lazy(() => import('./CodeHighlighter'))
const LazyMermaidBlock = lazy(() => import('./MermaidBlock'))
const languageAliases: Record<string, string> = {
  cs: 'csharp',
  html: 'markup',
  js: 'javascript',
  md: 'markdown',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
  xml: 'markup',
  zsh: 'bash',
}
const highlightedLanguages = new Set([
  'bash',
  'csharp',
  'css',
  'javascript',
  'json',
  'markdown',
  'markup',
  'typescript',
])

/** Minimal shape of the HAST nodes React-Markdown hands to block renderers. */
interface MarkdownNode {
  children?: MarkdownNode[]
  properties?: Record<string, unknown>
  tagName?: string
  type?: string
  value?: string
}

/** Returns the source of a Mermaid fenced block and nothing for any other block. */
function readMermaidSource(node: MarkdownNode | undefined): string | null {
  const code = node?.children?.[0]
  if (code?.type !== 'element' || code.tagName !== 'code') return null
  const className = code.properties?.className
  const classes = Array.isArray(className) ? className : [className]
  if (!classes.includes('language-mermaid')) return null
  const source = (code.children ?? []).map((child) => child.value ?? '').join('').trim()
  return source || null
}

/** Defers syntax highlighting until a fenced block approaches the viewport. */
function MarkdownCode({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const rawLanguage = /(?:^|\s)language-([^\s]+)/.exec(className ?? '')?.[1]?.toLowerCase()
  const language = rawLanguage ? languageAliases[rawLanguage] ?? rawLanguage : undefined
  const canHighlight = Boolean(language && highlightedLanguages.has(language))

  useEffect(() => {
    if (!canHighlight || isNearViewport) return
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsNearViewport(true)
      },
      { rootMargin: '800px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [canHighlight, isNearViewport])

  const plainCode = <code className={className} ref={ref}>{children}</code>
  if (!canHighlight || !isNearViewport) return plainCode
  return (
    <Suspense fallback={plainCode}>
      <LazyCodeHighlighter
        className={className}
        CodeTag='span'
        customStyle={{
          background: 'transparent',
          font: 'inherit',
          margin: 0,
          padding: 0,
          whiteSpace: 'inherit',
        }}
        language={language}
        PreTag='code'
        wrapLongLines
      >
        {String(children ?? '')}
      </LazyCodeHighlighter>
    </Suspense>
  )
}

/** Renders conversation Markdown and optionally exposes validated front matter as a table. */
export const Markdown = memo(function Markdown(
  {
    children,
    copyablePre = false,
    onError,
    renderFrontmatter = false,
  }: {
    children: string
    copyablePre?: boolean
    onError?: (cause: unknown) => void
    renderFrontmatter?: boolean
  },
) {
  const frontmatter = renderFrontmatter ? parseMarkdownFrontmatter(children) : null
  const body = frontmatter?.body ?? children
  const codeBlock = (code: ReactNode) =>
    copyablePre ? <CopyablePre onError={onError}>{code}</CopyablePre> : <pre>{code}</pre>

  return (
    <>
      {frontmatter && frontmatter.entries.length > 0 && (
        <table className='tool-call-frontmatter'>
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {frontmatter.entries.map(({ key, value }) => (
              <tr key={key}>
                <th scope='row'>{key}</th>
                <td>
                  <code className='tool-call-frontmatter-value'>{value}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReactMarkdown
        components={{
          code: ({ children: code, className }) => (
            <MarkdownCode className={className}>{code}</MarkdownCode>
          ),
          pre: ({ children: code, node }) => {
            const source = readMermaidSource(node as MarkdownNode | undefined)
            if (!source) return codeBlock(code)
            const plain = <CopyablePre onError={onError}>{code}</CopyablePre>
            return (
              <Suspense fallback={plain}>
                <LazyMermaidBlock fallback={plain} source={source} />
              </Suspense>
            )
          },
        }}
        remarkPlugins={[remarkGfm]}
      >
        {body}
      </ReactMarkdown>
    </>
  )
})
