import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { TranscriptionStatus } from '../../api.ts'

interface DictationSetupDialogProps {
  status: TranscriptionStatus | null
  /** Re-reads backend prerequisites after an install or a download. */
  onRefresh: () => Promise<void>
  /** Downloads one model size into the user's data directory. */
  onDownloadModel: (size: string) => Promise<void>
  onError: (cause: unknown) => void
  onClose: () => void
}

/**
 * Guides the local transcription setup: it reports each prerequisite, copies the
 * package command where one is known, and downloads a model into the user data
 * directory. Nothing runs with elevated rights from here.
 */
export function DictationSetupDialog({
  status,
  onRefresh,
  onDownloadModel,
  onError,
  onClose,
}: DictationSetupDialogProps) {
  const [downloading, setDownloading] = useState('')
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  async function copyCommand(command: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(command)
    } catch (cause) {
      onError(cause)
    }
  }

  async function download(size: string): Promise<void> {
    setDownloading(size)
    try {
      await onDownloadModel(size)
      await onRefresh()
    } catch (cause) {
      onError(cause)
    } finally {
      setDownloading('')
    }
  }

  async function refresh(): Promise<void> {
    setChecking(true)
    try {
      await onRefresh()
    } catch (cause) {
      onError(cause)
    } finally {
      setChecking(false)
    }
  }

  /** Keeps keyboard focus inside the dialog and closes it on Escape. */
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!downloading) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [tabindex]:not([tabindex="-1"])',
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

  return (
    <div
      className='modal-backdrop'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !downloading) onClose()
      }}
    >
      <div
        aria-labelledby='dictation-setup-title'
        aria-modal='true'
        className='modal dictation-setup-modal'
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role='dialog'
      >
        <h2 id='dictation-setup-title'>Set up voice dictation</h2>
        <p>
          Dictation transcribes on this machine with whisper.cpp: no audio leaves your computer.
          Everything below is local except the model download.
        </p>
        {status === null
          ? <p className='dictation-setup-loading'>Checking the backend…</p>
          : (
            <ul className='dictation-setup-checks'>
              <ChecklistRow
                detail={status.binary ?? 'Not installed'}
                label='whisper.cpp'
                ok={status.binary !== null}
              />
              {status.binary === null && status.binaryInstall && (
                <CommandRow
                  command={status.binaryInstall}
                  copied={copied === status.binaryInstall}
                  onCopy={() => void copyCommand(status.binaryInstall ?? '')}
                />
              )}
              <ChecklistRow
                detail={status.model ?? `Not downloaded · ${status.modelDirectory}`}
                label='Model'
                ok={status.model !== null}
              />
              {status.model === null && (
                <li className='dictation-setup-actions'>
                  {status.modelOptions.map((option) => (
                    <button
                      disabled={Boolean(downloading) || checking}
                      key={option.size}
                      onClick={() => void download(option.size)}
                      type='button'
                    >
                      {downloading === option.size
                        ? `Downloading ${option.size}…`
                        : `Download ${option.size} (${option.megabytes} MB)`}
                    </button>
                  ))}
                </li>
              )}
              <ChecklistRow
                detail={status.ffmpeg ? 'Installed' : 'Not installed'}
                label='ffmpeg'
                ok={status.ffmpeg}
              />
              {!status.ffmpeg && status.ffmpegInstall && (
                <CommandRow
                  command={status.ffmpegInstall}
                  copied={copied === status.ffmpegInstall}
                  onCopy={() => void copyCommand(status.ffmpegInstall ?? '')}
                />
              )}
            </ul>
          )}
        <p className='dictation-setup-note'>
          Package commands run in your own terminal: models download from the official whisper.cpp
          repository, and a re-check confirms the result.
        </p>
        <div className='modal-actions'>
          <button disabled={checking || Boolean(downloading)} onClick={onClose} type='button'>
            Close
          </button>
          <button
            className='primary'
            disabled={checking || Boolean(downloading)}
            onClick={() => void refresh()}
            ref={closeRef}
            type='button'
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChecklistRow({ label, detail, ok }: { label: string; detail: string; ok: boolean }) {
  return (
    <li className={ok ? 'dictation-setup-check ready' : 'dictation-setup-check'}>
      <span aria-hidden='true' className='dictation-setup-mark' />
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </li>
  )
}

function CommandRow({ command, copied, onCopy }: {
  command: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <li className='dictation-setup-command'>
      <code>{command}</code>
      <button aria-label={`Copy command: ${command}`} onClick={onCopy} type='button'>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </li>
  )
}
