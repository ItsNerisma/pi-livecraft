/** Browser microphone recording for composer dictation. */
import { normalizeLanguage } from './composer-utils.ts'

/** Persistent dictation preferences, stored in `localStorage`. */
export interface DictationPreferences {
  /** Whether the composer shows the microphone button. */
  enabled: boolean
  /** Whether a recognised transcript goes through the surface cleanup pass. */
  cleanup: boolean
  /** Language code handed to the recogniser, or `auto` to detect it. */
  language: string
}

/** One active microphone recording. */
export interface DictationRecording {
  /** Stops the microphone, resolves with the recorded clip, and releases the device. */
  stop(): Promise<Blob>
}

const dictationStorageKey = 'pi-livecraft.dictation'

/** Audio container candidates, most compact first; the browser decides what it supports. */
const mimeCandidates = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

/** Reads dictation preferences, falling back to the browser language on first use. */
export function readDictationPreferences(): DictationPreferences {
  const stored = readStoredPreferences()
  return {
    enabled: stored?.enabled ?? true,
    cleanup: stored?.cleanup ?? true,
    language: stored?.language ?? browserLanguage(),
  }
}

/** Persists dictation preferences, ignoring quota and privacy-mode failures. */
export function writeDictationPreferences(preferences: DictationPreferences): void {
  try {
    window.localStorage.setItem(dictationStorageKey, JSON.stringify(preferences))
  } catch {
    // A blocked storage must not break dictation itself.
  }
}

function readStoredPreferences(): Partial<DictationPreferences> | undefined {
  try {
    const raw = window.localStorage.getItem(dictationStorageKey)
    if (!raw) return undefined
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const record = value as Record<string, unknown>
    return {
      enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
      cleanup: typeof record.cleanup === 'boolean' ? record.cleanup : undefined,
      language: normalizeLanguage(record.language),
    }
  } catch {
    return undefined
  }
}

/** Derives a default dictation language from the interface language. */
function browserLanguage(): string {
  const [primary] = (globalThis.navigator?.language ?? '').split('-')
  return normalizeLanguage(primary) ?? 'auto'
}

/** Returns true when this browser can both record audio and reach a microphone. */
export function dictationSupported(): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/** Opens the microphone and starts recording; the caller only has to stop it. */
export async function startDictation(): Promise<DictationRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  const release = () => stream.getTracks().forEach((track) => track.stop())

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })
  recorder.addEventListener('error', release)
  recorder.start()

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.addEventListener('stop', () => {
          release()
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
        }, { once: true })
        recorder.stop()
      }),
  }
}
