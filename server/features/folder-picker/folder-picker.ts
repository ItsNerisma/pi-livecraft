import { spawn, type ChildProcess } from 'node:child_process'
import { getDesktopPlatform } from '../../system-integration.ts'

export type FolderPickerPlatform = 'darwin' | 'linux' | 'wsl' | 'windows'

/** A native dialog command; candidates are tried in order until one starts. */
export interface FolderPickerInvocation {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
) => ChildProcess

const pickerTitle = 'Select a workspace folder'

/** Raised when the host provides none of the supported native folder dialogs. */
export class FolderPickerUnavailableError extends Error {
  constructor() {
    super('No native folder picker is available on this system')
    this.name = 'FolderPickerUnavailableError'
  }
}

/** Detects the desktop whose folder dialog should be opened; macOS bypasses openPath support. */
export function getFolderPickerPlatform(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): FolderPickerPlatform {
  if (platform === 'darwin') return 'darwin'
  return getDesktopPlatform(platform, env)
}

/** Lists the native dialogs available on the platform, most preferred first. */
export function folderPickerInvocations(
  platform: FolderPickerPlatform,
  initialPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): FolderPickerInvocation[] {
  if (platform === 'windows') {
    return [{
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-STA', '-Command', windowsPickerScript],
      env: { ...env, PI_LIVECRAFT_PICK_INITIAL: initialPath ?? '' },
    }]
  }
  if (platform === 'darwin') {
    const defaultLocation = initialPath
      ? ` default location (POSIX file "${escapeAppleScriptString(initialPath)}" as alias)`
      : ''
    return [{
      command: 'osascript',
      args: ['-e', `POSIX path of (choose folder with prompt "${pickerTitle}"${defaultLocation})`],
    }]
  }
  return [
    {
      command: 'zenity',
      args: [
        '--file-selection',
        '--directory',
        `--title=${pickerTitle}`,
        ...(initialPath
          ? [`--filename=${initialPath}${initialPath.endsWith('/') ? '' : '/'}`]
          : []),
      ],
    },
    {
      command: 'kdialog',
      args: [
        '--getexistingdirectory',
        ...(initialPath ? [initialPath] : []),
        '--title',
        pickerTitle,
      ],
    },
    {
      command: 'yad',
      args: [
        '--file',
        '--directory',
        `--title=${pickerTitle}`,
        ...(initialPath
          ? [`--filename=${initialPath}${initialPath.endsWith('/') ? '' : '/'}`]
          : []),
      ],
    },
  ]
}

/**
 * Opens the first available native folder dialog and resolves the chosen directory.
 * Returns null when the user cancels; throws when no dialog can be started.
 */
export async function pickDirectory(
  platform = getFolderPickerPlatform(),
  initialPath?: string,
  spawnProcess: SpawnProcess = spawn,
): Promise<string | null> {
  for (const invocation of folderPickerInvocations(platform, initialPath)) {
    try {
      return await runPicker(invocation, platform, spawnProcess)
    } catch (error) {
      if (!isMissingExecutable(error)) throw error
    }
  }
  throw new FolderPickerUnavailableError()
}

/** Runs one candidate dialog: a path on success, null on cancel, and an error otherwise. */
function runPicker(
  invocation: FolderPickerInvocation,
  platform: FolderPickerPlatform,
  spawnProcess: SpawnProcess,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(invocation.command, invocation.args, {
      env: invocation.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    let errorOutput = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf8')
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        const selected = output.trim()
        resolve(selected.length > 0 ? selected : null)
        return
      }
      // osascript reports both a cancelled dialog (-128) and script errors with exit code 1.
      if (code === 1 && (platform !== 'darwin' || errorOutput.includes('-128'))) {
        resolve(null)
        return
      }
      reject(
        new Error(
          errorOutput.trim() || `${invocation.command} exited with code ${code ?? 'unknown'}`,
        ),
      )
    })
  })
}

function isMissingExecutable(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** Escapes a path so it stays a single AppleScript string literal. */
function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** The path reaches PowerShell only through the environment, never through the script text. */
const windowsPickerScript = [
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
  `$dialog.Description = "${pickerTitle}"`,
  '$initial = $env:PI_LIVECRAFT_PICK_INITIAL',
  'if ($initial -and (Test-Path -LiteralPath $initial -PathType Container)) { $dialog.SelectedPath = $initial }',
  'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
  'else { exit 1 }',
]
  .join('; ')
