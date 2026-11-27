import type {
  DirectoryListing,
  DirectoryPickResult,
  GitFileDiff,
  GitPushResult,
  GitResetResult,
  GitRevertResult,
  GitSnapshot,
  JsonObject,
  ManagerEvent,
  PromptTemplate,
  QuotaSnapshot,
  RecentSession,
  SessionSnapshot,
  SessionSummary,
  TodoItem,
  WorkspaceFile,
} from '../shared/types.ts'
import { isObject } from '../shared/is-object.ts'

const managerEventNames: readonly ManagerEvent['event'][] = [
  'session_created',
  'session_exited',
  'session_reassigned',
  'manager_connected',
  'manager_disconnected',
  'manager_status',
  'pi',
]

/** Parses and validates an event received from the backend SSE boundary. */
export function parseManagerEvent(data: string): ManagerEvent | null {
  try {
    const value: unknown = JSON.parse(data)
    if (
      !isObject(value) || value.kind !== 'event' || typeof value.event !== 'string'
      || typeof value.sessionId !== 'string'
    ) return null
    if (!managerEventNames.includes(value.event as ManagerEvent['event'])) return null
    if (
      value.sequence !== undefined
      && (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0)
    ) return null
    return value as unknown as ManagerEvent
  } catch {
    return null
  }
}

/** Subscribes to validated manager events while preserving EventSource reconnection. */
export function subscribeManagerEvents(
  onEvent: (event: ManagerEvent) => void,
  onError: () => void,
): () => void {
  const source = new EventSource('/api/events')
  source.onmessage = ({ data }) => {
    const event = parseManagerEvent(data)
    if (event) onEvent(event)
  }
  source.onerror = onError
  return () => source.close()
}

export async function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>('/api/sessions')
}

export async function restartManager(): Promise<void> {
  await request<void>('/api/manager/restart', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Lists resumable sessions from every workspace; each result carries its own `cwd`. */
export async function listRecentSessions(): Promise<RecentSession[]> {
  return request<RecentSession[]>('/api/sessions/recent')
}

export async function listDirectories(path: string): Promise<DirectoryListing> {
  return request<DirectoryListing>(`/api/directories?path=${encodeURIComponent(path)}`)
}

/** Opens the host's native folder dialog, starting near the current workspace when provided. */
export async function pickDirectory(cwd?: string): Promise<DirectoryPickResult> {
  return request<DirectoryPickResult>('/api/directories/pick', {
    method: 'POST',
    body: JSON.stringify({ cwd }),
  })
}

export async function openExplorer(cwd: string): Promise<void> {
  await request<void>('/api/explorer', {
    method: 'POST',
    body: JSON.stringify({ cwd }),
  })
}

export async function getGitSnapshot(cwd: string): Promise<GitSnapshot> {
  return request<GitSnapshot>(`/api/git?cwd=${encodeURIComponent(cwd)}`)
}

export async function getGitFileDiff(
  cwd: string,
  path: string,
  commitHash?: string,
): Promise<GitFileDiff> {
  const commit = commitHash ? `&commit=${encodeURIComponent(commitHash)}` : ''
  return request<GitFileDiff>(
    `/api/git/diff?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}${commit}`,
  )
}

export async function getWorkspaceFile(cwd: string, path: string): Promise<WorkspaceFile> {
  return request<WorkspaceFile>(
    `/api/files?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`,
  )
}

export async function openWorkspaceFile(cwd: string, path: string): Promise<void> {
  await request<void>('/api/files/open', {
    method: 'POST',
    body: JSON.stringify({ cwd, path }),
  })
}

export async function getWorkspaceFilePath(
  cwd: string,
  path: string,
): Promise<{ absolutePath: string; path: string }> {
  return request<{ absolutePath: string; path: string }>(
    `/api/files/path?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`,
  )
}

export async function getTodos(cwd: string): Promise<TodoItem[]> {
  return request<TodoItem[]>(`/api/todos?cwd=${encodeURIComponent(cwd)}`)
}

export async function updateTodos(cwd: string, todos: TodoItem[]): Promise<TodoItem[]> {
  return request<TodoItem[]>('/api/todos', {
    method: 'PUT',
    body: JSON.stringify({ cwd, todos }),
  })
}

export async function openTerminal(cwd: string, template: string): Promise<void> {
  await request<void>('/api/terminal', {
    method: 'POST',
    body: JSON.stringify({ cwd, template }),
  })
}

export async function commitChanges(cwd: string, message: string): Promise<void> {
  await request<void>('/api/git/commit', {
    method: 'POST',
    body: JSON.stringify({ cwd, message }),
  })
}

export async function pushCommits(cwd: string): Promise<GitPushResult> {
  return request<GitPushResult>('/api/git/push', {
    method: 'POST',
    body: JSON.stringify({ cwd }),
  })
}

export async function discardChanges(cwd: string, path?: string): Promise<void> {
  await request<void>('/api/git/discard', {
    method: 'POST',
    body: JSON.stringify({ cwd, path }),
  })
}

export async function resetGitCommit(cwd: string, hash: string): Promise<GitResetResult> {
  return request<GitResetResult>('/api/git/reset', {
    method: 'POST',
    body: JSON.stringify({ cwd, hash }),
  })
}

export async function revertGitCommit(cwd: string, hash: string): Promise<GitRevertResult> {
  return request<GitRevertResult>('/api/git/revert', {
    method: 'POST',
    body: JSON.stringify({ cwd, hash }),
  })
}

/** Persists a draft using Pi's project or user prompt-template convention. */
export async function savePrompt(
  cwd: string,
  scope: 'global' | 'project',
  name: string,
  content: string,
): Promise<PromptTemplate> {
  return request<PromptTemplate>('/api/prompts', {
    method: 'POST',
    body: JSON.stringify({ cwd, scope, name, content }),
  })
}

export async function createSession(cwd: string): Promise<SessionSummary> {
  return request<SessionSummary>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ cwd }),
  })
}

export async function openSession(cwd: string, sessionPath: string): Promise<SessionSummary> {
  return request<SessionSummary>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ cwd, sessionPath }),
  })
}

export async function closeSession(sessionId: string): Promise<void> {
  await request<void>(`/api/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function renameSession(
  cwd: string,
  sessionPath: string,
  name: string,
): Promise<void> {
  await request<void>('/api/sessions/rename', {
    method: 'POST',
    body: JSON.stringify({ cwd, name, sessionPath }),
  })
}

export async function getSnapshot(sessionId: string): Promise<SessionSnapshot> {
  return request<SessionSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/snapshot`)
}

export async function getQuotas(): Promise<QuotaSnapshot> {
  return request<QuotaSnapshot>('/api/quotas')
}

export async function refreshQuotas(sessionId: string, automatic = false): Promise<QuotaSnapshot> {
  return request<QuotaSnapshot>('/api/quotas/refresh', {
    method: 'POST',
    body: JSON.stringify({ automatic, sessionId }),
  })
}

/** Requests an isolated rewrite without adding the draft or result to the active Pi session. */
export async function improvePrompt(
  sessionId: string,
  prompt: string,
  direction?: string,
): Promise<{ prompt: string; cost?: number }> {
  return request<{ prompt: string; cost?: number }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/prompt-improvement`,
    {
      method: 'POST',
      body: JSON.stringify({ prompt, direction }),
    },
  )
}

/** Configuration for an isolated Pi prompt execution. */
export interface RunPromptOptions {
  prompt: string
  systemPrompt?: string
  thinkingLevel?: string
  model?: { provider: string; modelId: string }
  extensions?: string[]
  tools?: string[]
  /** Disable automatic AGENTS.md/CLAUDE.md loading (default true). Set false to provide your own context. */
  includeContextFiles?: boolean
}

/** Runs a prompt in an isolated Pi process with caller-controlled configuration. */
export async function runPrompt(sessionId: string, options: RunPromptOptions): Promise<string> {
  const result = await request<{ text: string }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/run-prompt`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    },
  )
  return result.text
}

export async function sendPiCommand(sessionId: string, command: JsonObject): Promise<JsonObject> {
  return request<JsonObject>(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
    method: 'POST',
    body: JSON.stringify(command),
  })
}

/** Local dictation prerequisites reported by the backend. */
export interface TranscriptionStatus {
  available: boolean
  binary: string | null
  model: string | null
  ffmpeg: boolean
  /** Remediation shown when local dictation cannot run. */
  hint: string
  /** Shell command that installs whisper.cpp on this host, when known. */
  binaryInstall: string | null
  /** Shell command that installs ffmpeg on this host, when known. */
  ffmpegInstall: string | null
  /** Directory the guided setup downloads models into. */
  modelDirectory: string
  /** Models the guided setup can download, smallest first. */
  modelOptions: { size: string; megabytes: number }[]
}

/** Reads whether local dictation can run on this machine. */
export async function fetchTranscriptionStatus(): Promise<TranscriptionStatus> {
  return request<TranscriptionStatus>('/api/transcription')
}

/** Downloads one whisper.cpp model into the user's data directory. */
export async function downloadTranscriptionModel(
  size: 'tiny' | 'base' | 'small',
): Promise<{ model: string }> {
  return request<{ model: string }>('/api/transcription/model', {
    method: 'POST',
    body: JSON.stringify({ size }),
  })
}

/**
 * Transcribes one recorded clip without adding it to the Pi session.
 *
 * When `clean` is set, the backend also applies the surface cleanup pass and
 * reports why it fell back to the raw transcript.
 */
export async function transcribeRecording(
  sessionId: string,
  audio: Blob,
  options: { clean: boolean; language: string },
): Promise<{ text: string; cleaned: boolean; cleanupError?: string }> {
  return request<{ text: string; cleaned: boolean; cleanupError?: string }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/transcription`,
    {
      method: 'POST',
      body: JSON.stringify({
        audio: await base64Audio(audio),
        mimeType: audio.type || 'audio/webm',
        ...options,
      }),
    },
  )
}

/** Encodes a recording for the JSON request body shared by every backend route. */
async function base64Audio(audio: Blob): Promise<string> {
  const bytes = new Uint8Array(await audio.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8_000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: typeof init?.body === 'string'
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  })
  const value: unknown = await response.json()
  if (!response.ok) {
    const message = isObject(value) && typeof value.error === 'string'
      ? value.error
      : `Request failed (${response.status})`
    throw new Error(message)
  }
  return value as T
}
