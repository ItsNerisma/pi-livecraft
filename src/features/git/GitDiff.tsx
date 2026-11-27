import { memo, useMemo, type ReactNode } from 'react'
import { CodeLines } from '../../components/CodeLines.tsx'
import { codeLanguageForPath } from '../../components/code-language.ts'
import { gitDiffBlocks, type GitDiffEntry, type GitDiffLine } from './git-diff.ts'

/** Renders parsed diff rows, coloring each hunk with the file's syntax. */
export const GitDiff = memo(function GitDiff(
  { entries, path }: { entries: GitDiffEntry[]; path: string },
) {
  const language = codeLanguageForPath(path)
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

        return (
          <CodeLines
            changedClassName={(kind) => `git-diff-token ${kind}`}
            key={index}
            language={language}
            lines={block.lines}
            renderLine={(line, content) => <DiffLine line={line}>{content}</DiffLine>}
          />
        )
      })}
    </section>
  )
})

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
