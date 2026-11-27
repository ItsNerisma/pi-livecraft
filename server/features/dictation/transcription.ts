import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

/** Binary names accepted for whisper.cpp, in detection order. */
const whisperBinaryNames = ['whisper-cli', 'whisper-cpp', 'main']

/** Model file names accepted inside a whisper.cpp model directory, most accurate first. */
const preferredModelNames = ['ggml-base.bin', 'ggml-small.bin', 'ggml-tiny.bin']

/** Directories scanned for a downloaded whisper.cpp model when no path is configured. */
const modelDirectoryNames = [
  'whisper.cpp/models',
  '.cache/whisper.cpp/models',
  '.local/share/whisper.cpp/models',
  'pi-livecraft/models',
]

/** Models the guided setup can download, with the upstream whispering.cpp repository names. */
const downloadableModels: Record<string, { file: string; megabytes: number }> = {
  tiny: { file: 'ggml-tiny.bin', megabytes: 77 },
  base: { file: 'ggml-base.bin', megabytes: 148 },
  small: { file: 'ggml-small.bin', megabytes: 488 },
}

/** Hard ceiling for one model download, so a wrong response cannot fill the disk. */
const maxModelBytes = 1_200_000_000

/** Model sizes the guided setup offers, smallest first. */
export const downloadableModelSizes = Object.keys(downloadableModels)

const modelBaseUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

/** Audio formats the browser recorder can produce, keyed by MIME type. */
const audioFormats: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
}

/** Reports whether local dictation can run, and what to install when it cannot. */
export interface TranscriptionStatus {
  available: boolean
  binary: string | null
  model: string | null
  ffmpeg: boolean
  /** Human-readable remediation shown in the UI when `available` is false. */
  hint: string
  /** Shell command that installs whisper.cpp on this host, when one is known. */
  binaryInstall: string | null
  /** Shell command that installs ffmpeg on this host, when one is known. */
  ffmpegInstall: string | null
  /** Directory where the guided setup stores a downloaded model. */
  modelDirectory: string
  /** Models the guided setup can download, smallest first. */
  modelOptions: { size: string; megabytes: number }[]
}

const installHint =
  'Install whisper.cpp (`sudo apt install whisper.cpp`) and download a ggml model, '
  + 'then set PI_LIVECRAFT_WHISPER_MODEL to its path. ffmpeg is required too.'

/** Loads the dictation cleanup prompt fresh from disk so edits apply without a restart. */
export async function loadTranscriptionCleanupSystemPrompt(): Promise<string> {
  return readFile(new URL('dictation-cleanup-system.txt', import.meta.url), 'utf8')
}

/** Describes the local dictation prerequisites without starting any process. */
export async function transcriptionStatus(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TranscriptionStatus> {
  const [binary, model, ffmpeg] = await Promise.all([
    resolveWhisperBinary(env),
    resolveWhisperModel(env),
    resolveExecutable('ffmpeg', env),
  ])
  const available = binary !== null && model !== null && ffmpeg !== null
  return {
    available,
    binary,
    model,
    ffmpeg: ffmpeg !== null,
    hint: available ? '' : installHint,
    binaryInstall: installCommand('whisper.cpp', 'whisper-cpp'),
    ffmpegInstall: installCommand('ffmpeg', 'ffmpeg'),
    modelDirectory: modelDownloadDirectory(env),
    modelOptions: Object.entries(downloadableModels).map(([size, entry]) => ({
      size,
      megabytes: entry.megabytes,
    })),
  }
}

/** Returns the package command for this host, or null when no package is known. */
function installCommand(linuxPackage: string, brewPackage: string): string | null {
  if (process.platform === 'darwin') return `brew install ${brewPackage}`
  if (process.platform === 'linux') return `sudo apt install ${linuxPackage}`
  return null
}

/** Returns the directory where the guided setup writes downloaded models. */
export function modelDownloadDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const dataHome = env.XDG_DATA_HOME || join(homedir(), '.local/share')
  return join(dataHome, 'pi-livecraft', 'models')
}

/** In-flight downloads, so two clicks cannot fetch the same model twice. */
const modelDownloads = new Map<string, Promise<string>>()

/**
 * Downloads one whisper.cpp model into the managed model directory.
 *
 * The model never enters the repository: it lands under the user's data
 * directory, and the download becomes visible to `resolveWhisperModel`
 * immediately. An existing file is reused without any network access.
 */
export async function downloadWhisperModel(
  size: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ model: string }> {
  const entry = downloadableModels[size]
  if (!entry) throw new Error(`Unsupported model size: ${size}`)
  const directory = modelDownloadDirectory(env)
  const target = join(directory, entry.file)
  if (await isReadableFile(target)) return { model: target }
  const pending = modelDownloads.get(target)
  if (pending) return { model: await pending }
  const download = fetchModel(join(modelBaseUrl, entry.file), directory, target)
  modelDownloads.set(target, download)
  try {
    return { model: await download }
  } finally {
    modelDownloads.delete(target)
  }
}

/** Streams one model file to disk and only reveals it once the body is complete. */
async function fetchModel(url: string, directory: string, target: string): Promise<string> {
  await mkdir(directory, { recursive: true })
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed (${response.status} ${response.statusText})`)
  }
  const part = `${target}.part`
  const file = await open(part, 'w')
  let received = 0
  try {
    for await (const chunk of response.body) {
      received += chunk.length
      if (received > maxModelBytes) throw new Error('Model download exceeded the size limit')
      await file.write(chunk)
    }
  } catch (error) {
    await file.close()
    await rm(part, { force: true })
    throw error
  }
  await file.close()
  await rename(part, target)
  return target
}

/** Returns the configured whisper.cpp binary or the first one found on `PATH`. */
export async function resolveWhisperBinary(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const configured = env.PI_LIVECRAFT_WHISPER_BIN
  if (configured) return await isExecutable(configured) ? configured : null
  for (const name of whisperBinaryNames) {
    const found = await resolveExecutable(name, env)
    if (found) return found
  }
  return null
}

/**
 * Returns the configured model path, or the best model already downloaded in a known location.
 *
 * The model never ships with this repository: the user downloads it, or points
 * `PI_LIVECRAFT_WHISPER_MODEL` at it.
 */
export async function resolveWhisperModel(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const configured = env.PI_LIVECRAFT_WHISPER_MODEL
  if (configured) return await isReadableFile(configured) ? configured : null
  const roots = [env.XDG_DATA_HOME, env.XDG_CACHE_HOME, join(homedir(), '.local/share'), homedir()]
    .filter((root): root is string => Boolean(root))
  for (const name of preferredModelNames) {
    for (const root of roots) {
      for (const directory of modelDirectoryNames) {
        const candidate = join(root, directory, name)
        if (await isReadableFile(candidate)) return candidate
      }
    }
  }
  for (const root of roots) {
    const directory = join(root, 'whisper.cpp', 'models')
    const discovered = await firstModelIn(directory)
    if (discovered) return discovered
  }
  return null
}

/** Resolves one executable name against `PATH` or as an explicit path. */
async function resolveExecutable(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (name.includes('/')) return await isExecutable(name) ? name : null
  const path = env.PATH ?? ''
  for (const directory of path.split(delimiter)) {
    if (!directory) continue
    const candidate = join(directory, name)
    if (await isExecutable(candidate)) return candidate
  }
  return null
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function firstModelIn(directory: string): Promise<string | null> {
  try {
    const entries = await readdir(directory)
    const model = entries
      .filter((name) => name.startsWith('ggml-') && name.endsWith('.bin'))
      .sort()[0]
    return model ? join(directory, model) : null
  } catch {
    return null
  }
}

/** Returns the file extension matching a recorded MIME type, or undefined when unsupported. */
export function audioExtension(mimeType: string): string | undefined {
  const essence = mimeType.split(';')[0].trim().toLowerCase()
  return audioFormats[essence]
}

/**
 * Transcribes one recorded audio buffer with whisper.cpp and returns plain text.
 *
 * The browser records compressed audio, so ffmpeg converts it to the 16 kHz mono
 * WAV that whisper.cpp requires. Both processes run unseen, with a hard timeout,
 * and the temporary directory is always removed.
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  language: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const extension = audioExtension(mimeType)
  if (!extension) throw new Error(`Unsupported audio format: ${mimeType}`)
  const status = await transcriptionStatus(env)
  if (!status.available || !status.binary || !status.model)
    throw new Error(status.hint || 'Local dictation is unavailable')

  const directory = await mkdtemp(join(tmpdir(), 'pi-livecraft-dictation-'))
  try {
    const source = join(directory, `input.${extension}`)
    const wav = join(directory, 'audio.wav')
    await writeFile(source, audio)
    await runProcess('ffmpeg', [
      '-nostdin',
      '-y',
      '-i',
      source,
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      wav,
    ], 60_000)
    // `-mc 0` disables cross-segment context so a noisy clip cannot drift into invented text.
    // The timeout stays generous for the ~8 minute upload cap but still fails fast on a hang.
    const output = await runProcess(status.binary, [
      '-m',
      status.model,
      '-f',
      wav,
      '-l',
      language,
      '-nt',
      '-np',
      '-mc',
      '0',
    ], 300_000)
    const text = parseWhisperOutput(output)
    if (!text) throw new Error('No speech was recognised in the recording')
    return text
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** Strips timestamps and whisper.cpp progress noise from the recognised text. */
export function parseWhisperOutput(output: string): string {
  return output
    .split('\n')
    .map((line) => line.replace(/^\[[^\]]*-->\s*[^\]]*\]\s*/, '').trim())
    .filter((line) => line && !/^whisper_|^system_info|^main: |^ggml_/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Runs one command to completion and returns its stdout, failing on a non-zero exit or timeout. */
async function runProcess(command: string, args: string[], timeoutMs: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out after ${timeoutMs} ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'))
        return
      }
      const detail = Buffer.concat(stderr).toString('utf8').trim().split('\n').slice(-3).join(' ')
      reject(new Error(`${command} exited with code ${code}${detail ? `: ${detail}` : ''}`))
    })
  })
}
