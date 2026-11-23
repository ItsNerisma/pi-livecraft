import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { listDirectories, pickDirectory } from '../../api.ts'
import { directoryCompletionTarget } from './directory-completion.ts'
import { workspaceName } from './workspace-groups.ts'

interface NewSessionDialogProps {
  recentPaths: string[]
  onClose: () => void
  onCreate: (path: string) => Promise<void>
  onError: (cause: unknown) => void
}

/**
 * Creates a session in a workspace chosen through the host's native folder dialog,
 * a recent workspace, or a typed path. The typed field stays available because a
 * headless host may not provide any native dialog.
 */
export function NewSessionDialog(
  { recentPaths, onClose, onCreate, onError }: NewSessionDialogProps,
) {
  const [path, setPath] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [browsing, setBrowsing] = useState(false)
  const [pickerUnavailable, setPickerUnavailable] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const completionVersionRef = useRef(0)
  const dialogRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    inputRef.current?.focus()
    return () => previousFocusRef.current?.focus()
  }, [])

  // Stale completions must not replace suggestions for the path currently typed.
  useEffect(() => {
    const version = ++completionVersionRef.current
    const target = path.trim() ? directoryCompletionTarget(path) : null
    if (!target) {
      setSuggestions([])
      return
    }
    void listDirectories(target.parentPath)
      .then((parent) => {
        if (version !== completionVersionRef.current) return
        setSuggestions(
          parent
            .directories
            .filter((directory) => directory.name.startsWith(target.namePrefix))
            .map((directory) => `${target.pathPrefix}${directory.name}`)
            .filter((suggestion) => suggestion !== path),
        )
        setActiveSuggestion(-1)
      })
      .catch(() => {
        if (version === completionVersionRef.current) setSuggestions([])
      })
  }, [path])

  const busy = browsing || creating

  function dismiss(): void {
    if (!busy) onClose()
  }

  /** Opens the host dialog and adopts the picked folder without creating anything yet. */
  async function browse(): Promise<void> {
    setBrowsing(true)
    setError('')
    setPickerUnavailable(false)
    try {
      const result = await pickDirectory(path.trim() || undefined)
      if (result.path) setPath(result.path)
      else if (result.unavailable) setPickerUnavailable(true)
    } catch (cause) {
      onError(cause)
    } finally {
      setBrowsing(false)
    }
  }

  function updatePath(nextPath: string): void {
    setPath(nextPath)
    if (error) setError('')
  }

  /** Applies standard completion-list shortcuts without intercepting normal input. */
  function handlePathKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      event.preventDefault()
      setActiveSuggestion((current) =>
        event.key === 'ArrowDown'
          ? Math.min(current + 1, suggestions.length - 1)
          : Math.max(current - 1, 0)
      )
      return
    }
    if (event.key === 'Tab') {
      const suggestion = suggestions[activeSuggestion >= 0 ? activeSuggestion : 0]
      if (!suggestion) return
      event.preventDefault()
      updatePath(suggestion)
      setActiveSuggestion(-1)
    }
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLFormElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dismiss()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const candidate = path.trim()
    if (!candidate) {
      setError('Choose a workspace folder first.')
      inputRef.current?.focus()
      return
    }
    setError('')
    setCreating(true)
    try {
      const directory = await listDirectories(candidate)
      await onCreate(directory.path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the session.')
    } finally {
      setCreating(false)
    }
  }

  const visibleRecentPaths = recentPaths.filter((recentPath) => recentPath !== path)

  return (
    <div
      className='modal-backdrop new-session-backdrop'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss()
      }}
    >
      <form
        aria-describedby={error ? 'new-session-error' : undefined}
        aria-labelledby='new-session-title'
        aria-modal='true'
        className='modal new-session-modal'
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
        ref={dialogRef}
        role='dialog'
      >
        <h2 id='new-session-title'>New workspace</h2>
        <p>A new Pi session starts in the folder you pick.</p>
        {visibleRecentPaths.length > 0 && (
          <section aria-labelledby='new-session-recent-title' className='recent-workspaces'>
            <strong id='new-session-recent-title'>Recent workspaces</strong>
            <div>
              {visibleRecentPaths
                .map((recentPath) => (
                  <button
                    aria-pressed={path !== '' && recentPath === path}
                    key={recentPath}
                    onClick={() => updatePath(recentPath)}
                    type='button'
                  >
                    <strong>{workspaceName(recentPath, visibleRecentPaths)}</strong>
                    <span>{recentPath}</span>
                  </button>
                ))}
            </div>
          </section>
        )}
        <div className='new-session-folder'>
          <label className='directory-path-label' htmlFor='new-session-path'>
            Workspace folder
          </label>
          <div className='directory-path-row'>
            <input
              aria-activedescendant={activeSuggestion >= 0
                ? `new-session-suggestion-${activeSuggestion}`
                : undefined}
              aria-autocomplete='list'
              aria-controls={suggestions.length > 0 ? 'new-session-suggestions' : undefined}
              aria-expanded={suggestions.length > 0}
              aria-invalid={Boolean(error)}
              autoComplete='off'
              className='directory-path-input'
              disabled={busy}
              id='new-session-path'
              onChange={(event) => updatePath(event.target.value)}
              onKeyDown={handlePathKeyDown}
              placeholder='~/projects or /absolute/path'
              ref={inputRef}
              role='combobox'
              value={path}
            />
            <button
              className='new-session-browse'
              disabled={busy}
              onClick={() => void browse()}
              type='button'
            >
              <FolderIcon />
              {browsing ? 'Opening…' : 'Choose folder…'}
            </button>
          </div>
          {pickerUnavailable && (
            <p className='new-session-hint'>
              No system folder dialog is available. Type the path instead.
            </p>
          )}
          {suggestions.length > 0 && (
            <div
              aria-label='Directory suggestions'
              className='directory-suggestions'
              id='new-session-suggestions'
              role='listbox'
            >
              {suggestions.map((suggestion, index) => (
                <div
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion ? 'active' : undefined}
                  id={`new-session-suggestion-${index}`}
                  key={suggestion}
                  onClick={() => {
                    updatePath(suggestion)
                    setActiveSuggestion(-1)
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  role='option'
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
          <p className='directory-path-hint'>
            Tab completes · ↑↓ navigate · Esc cancels
          </p>
        </div>
        {error && <p className='new-session-error' id='new-session-error' role='alert'>{error}</p>}
        <div className='modal-actions'>
          <button disabled={busy} onClick={onClose} type='button'>Cancel</button>
          <button className='primary' disabled={busy || !path.trim()} type='submit'>
            {creating ? 'Starting…' : 'New workspace'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FolderIcon() {
  return (
    <svg
      aria-hidden='true'
      fill='none'
      height='16'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='1.5'
      viewBox='0 0 24 24'
      width='16'
    >
      <path d='M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z' />
    </svg>
  )
}
