import { CodeLines } from '../../components/CodeLines.tsx'
import { codeLanguageForPath } from '../../components/code-language.ts'
import { intraLineDiff } from '../../../shared/text-diff.ts'
import { editDiffDisplayLines, toolEditChanges, type EditDiffLine } from './tool-presentation.ts'

/** Displays each replacement from an edit call, preferring Pi's line-numbered diff when available. */
export function ToolCallEditDiff(
  { changes, diffLines, filePath, onCollapse }: {
    changes: ReturnType<typeof toolEditChanges>
    diffLines: EditDiffLine[]
    filePath: string | null
    onCollapse: () => void
  },
) {
  const language = codeLanguageForPath(filePath)

  if (diffLines.length > 0) {
    const displayLines = editDiffDisplayLines(diffLines)

    return (
      <section className='tool-call-content tool-call-edit-diff' onClick={onCollapse}>
        <section className='tool-call-edit-change'>
          <CodeLines
            changedClassName={(kind) => `diff-seg-${kind}`}
            language={language}
            lines={displayLines}
            renderLine={(line, content) => {
              const sign = line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '
              return (
                <div className={`tool-call-edit-line ${line.kind}`}>
                  <span>{line.lineNumber ?? ''}</span>
                  <i aria-hidden='true'>{sign}</i>
                  <pre>{content}</pre>
                </div>
              )
            }}
          />
        </section>
      </section>
    )
  }

  return (
    <section className='tool-call-content tool-call-edit-diff' onClick={onCollapse}>
      {changes.map((change, index) => {
        const segments = intraLineDiff(change.oldText, change.newText)
        return (
          <section className='tool-call-edit-change' key={index}>
            <h4>Change {index + 1}</h4>
            <div className='tool-call-edit-line removed'>
              <span />
              <i aria-hidden='true'>−</i>
              <pre>{segments.filter(s => s.kind !== 'added').map((seg, si) => <span className={seg.highlighted === false ? undefined : `diff-seg-${seg.kind}`} key={si}>{seg.text}</span>)}</pre>
            </div>
            <div className='tool-call-edit-line added'>
              <span />
              <i aria-hidden='true'>+</i>
              <pre>{segments.filter(s => s.kind !== 'removed').map((seg, si) => <span className={seg.highlighted === false ? undefined : `diff-seg-${seg.kind}`} key={si}>{seg.text}</span>)}</pre>
            </div>
          </section>
        )
      })}
    </section>
  )
}
