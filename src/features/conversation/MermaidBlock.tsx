import { useEffect, useState, type ReactNode } from 'react'
import { CodeBlockActions } from './CodeBlock.tsx'

/**
 * Mermaid outweighs the rest of the conversation bundle, so it loads on the
 * first diagram. Colours come from the conversation stylesheet instead of
 * theme variables: Mermaid derives colours with khroma, which rejects `var()`.
 */
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
let renderCount = 0

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: { fontFamily: 'inherit' },
    })
    return mermaid
  })
  return mermaidPromise
}

/**
 * Renders a fenced Mermaid diagram as SVG and falls back to the plain code
 * block while loading and whenever the source is not a valid diagram.
 */
export default function MermaidBlock(
  { fallback, source }: { fallback: ReactNode; source: string },
) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadMermaid()
      .then((mermaid) => {
        renderCount += 1
        return mermaid.render(`conversation-mermaid-${renderCount}`, source)
      })
      .then((result) => {
        if (active) setSvg(result.svg)
      })
      .catch(() => {
        if (active) setSvg(null)
      })
    return () => {
      active = false
    }
  }, [source])

  if (!svg) return <>{fallback}</>

  return (
    <div className='conversation-code-block conversation-mermaid'>
      <div
        className='conversation-mermaid-diagram'
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <CodeBlockActions value={() => source} />
    </div>
  )
}
