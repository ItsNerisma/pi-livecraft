import { useEffect, useState, type ReactNode } from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'
import { CodeBlockActions } from './CodeBlock.tsx'

/**
 * Mermaid outweighs the rest of the conversation bundle, so it loads on the
 * first diagram. Colours come from the conversation stylesheet instead of
 * theme variables: Mermaid derives colours with khroma, which rejects `var()`.
 */
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
let renderCount = 0

/** Zoom steps keep the diagram sharp: the SVG scales as a vector at every level. */
const MAX_ZOOM_STEP = 8
const ZOOM_STEP = 0.25

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      look: 'classic',
      themeVariables: { fontFamily: 'inherit', fontSize: '13px' },
      flowchart: {
        diagramPadding: 4,
        nodeSpacing: 28,
        padding: 8,
        rankSpacing: 32,
        useMaxWidth: false,
        wrappingWidth: 280,
      },
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
  { fallback, onError, source }: {
    fallback: ReactNode
    onError?: (cause: unknown) => void
    source: string
  },
) {
  const [svg, setSvg] = useState<string | null>(null)
  const [zoomStep, setZoomStep] = useState(0)

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

  const zoom = 1 + zoomStep * ZOOM_STEP

  return (
    <div className='conversation-code-block conversation-mermaid'>
      <div className='conversation-mermaid-scroll'>
        <div
          className='conversation-mermaid-diagram'
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ zoom }}
        />
      </div>
      <CodeBlockActions onError={onError} value={() => source}>
        <Tooltip label='Zoom out'>
          <button
            aria-label='Zoom out'
            className='conversation-action-button'
            disabled={zoomStep === 0}
            onClick={() => setZoomStep((step) => Math.max(0, step - 1))}
            type='button'
          >
            <svg aria-hidden='true' viewBox='0 0 16 16'>
              <path
                d='M3.5 8h9'
                fill='none'
                stroke='currentColor'
                strokeLinecap='round'
                strokeWidth='1.5'
              />
            </svg>
          </button>
        </Tooltip>
        <button
          aria-label='Reset zoom'
          className='conversation-mermaid-zoom'
          disabled={zoomStep === 0}
          onClick={() => setZoomStep(0)}
          type='button'
        >
          {Math.round(zoom * 100)}%
        </button>
        <Tooltip label='Zoom in'>
          <button
            aria-label='Zoom in'
            className='conversation-action-button'
            disabled={zoomStep === MAX_ZOOM_STEP}
            onClick={() => setZoomStep((step) => Math.min(MAX_ZOOM_STEP, step + 1))}
            type='button'
          >
            <svg aria-hidden='true' viewBox='0 0 16 16'>
              <path
                d='M3.5 8h9M8 3.5v9'
                fill='none'
                stroke='currentColor'
                strokeLinecap='round'
                strokeWidth='1.5'
              />
            </svg>
          </button>
        </Tooltip>
      </CodeBlockActions>
    </div>
  )
}
