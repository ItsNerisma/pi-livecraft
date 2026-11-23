import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  folderPickerInvocations,
  FolderPickerUnavailableError,
  getFolderPickerPlatform,
  pickDirectory,
} from '../server/features/folder-picker/folder-picker.ts'

interface FakeRun {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

/** Builds a spawn stand-in whose children answer with the scripted outcome. */
function fakeSpawn(
  runs: FakeRun[],
  outcome: (run: FakeRun) => { code?: number; output?: string; stderr?: string; error?: Error },
) {
  const calls: string[] = []
  const spawnProcess = ((command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
    const run = { command, args, env: options.env }
    runs.push(run)
    calls.push(command)
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    const result = outcome(run)
    queueMicrotask(() => {
      if (result.error) {
        child.emit('error', result.error)
        return
      }
      if (result.stderr) child.stderr.emit('data', Buffer.from(result.stderr))
      if (result.output) child.stdout.emit('data', Buffer.from(result.output))
      child.emit('close', result.code ?? 0)
    })
    return child as never
  }) as never
  return { calls, spawnProcess }
}

function missingExecutable(): Error {
  return Object.assign(new Error('spawn zenity ENOENT'), { code: 'ENOENT' })
}

test('detects the dialog platform from the process platform and WSL markers', () => {
  assert.equal(getFolderPickerPlatform('darwin', {}), 'darwin')
  assert.equal(getFolderPickerPlatform('win32', {}), 'windows')
  assert.equal(getFolderPickerPlatform('linux', {}), 'linux')
  assert.equal(getFolderPickerPlatform('linux', { WSL_DISTRO_NAME: 'Ubuntu' }), 'wsl')
  assert.throws(() => getFolderPickerPlatform('freebsd', {}))
})

test('orders Linux dialogs from zenity to kdialog to yad', () => {
  const invocations = folderPickerInvocations('linux', '/home/user/work')
  assert.deepEqual(invocations.map(({ command }) => command), ['zenity', 'kdialog', 'yad'])
  assert.deepEqual(invocations[0].args, [
    '--file-selection',
    '--directory',
    '--title=Select a workspace folder',
    '--filename=/home/user/work/',
  ])
  assert.deepEqual(invocations[1].args, [
    '--getexistingdirectory',
    '/home/user/work',
    '--title',
    'Select a workspace folder',
  ])
})

test('omits starting paths when no initial directory is known', () => {
  const invocations = folderPickerInvocations('linux')
  assert.deepEqual(invocations[0].args, [
    '--file-selection',
    '--directory',
    '--title=Select a workspace folder',
  ])
  assert.deepEqual(invocations[1].args, [
    '--getexistingdirectory',
    '--title',
    'Select a workspace folder',
  ])
})

test('passes the Windows starting directory only through the environment', () => {
  const [invocation] = folderPickerInvocations('windows', 'C:\\hostile & ü')
  assert.equal(invocation.command, 'powershell.exe')
  assert.deepEqual(invocation.args.slice(0, 4), [
    '-NoProfile',
    '-NonInteractive',
    '-STA',
    '-Command',
  ])
  assert.ok(!invocation.args.join(' ').includes('hostile'))
  assert.equal(invocation.env?.PI_LIVECRAFT_PICK_INITIAL, 'C:\\hostile & ü')
})

test('escapes the macOS default location inside the AppleScript literal', () => {
  const [invocation] = folderPickerInvocations('darwin', '/Users/a "quoted" dir')
  assert.equal(invocation.command, 'osascript')
  assert.deepEqual(invocation.args.slice(0, 1), ['-e'])
  assert.match(
    invocation.args[1],
    /default location \(POSIX file "\/Users\/a \\"quoted\\" dir" as alias\)/,
  )
})

test('resolves the selected path from the first available dialog', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, () => ({ output: '/home/user/chosen\n' }))
  assert.equal(await pickDirectory('linux', '/home/user', spawnProcess), '/home/user/chosen')
  assert.deepEqual(runs.map(({ command }) => command), ['zenity'])
})

test('falls through candidates whose executable is missing', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, (run) =>
    run.command === 'zenity'
      ? { error: missingExecutable() }
      : { output: '/home/user/chosen' })
  assert.equal(await pickDirectory('linux', undefined, spawnProcess), '/home/user/chosen')
  assert.deepEqual(runs.map(({ command }) => command), ['zenity', 'kdialog'])
})

test('treats exit code 1 as a cancellation and stops trying candidates', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, () => ({ code: 1 }))
  assert.equal(await pickDirectory('linux', undefined, spawnProcess), null)
  assert.deepEqual(runs.map(({ command }) => command), ['zenity'])
})

test('treats an osascript error -128 as a cancellation', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, () => ({
    code: 1,
    stderr: 'execution error: User canceled. (-128)',
  }))
  assert.equal(await pickDirectory('darwin', undefined, spawnProcess), null)
})

test('reports other osascript failures', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, () => ({
    code: 1,
    stderr: 'execution error: Invalid default location (-1728)',
  }))
  await assert.rejects(
    () => pickDirectory('darwin', undefined, spawnProcess),
    /Invalid default location/,
  )
})

test('reports a dialog failure that is not a cancellation', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, () => ({
    code: 2,
    stderr: 'cannot open display',
  }))
  await assert.rejects(() => pickDirectory('linux', undefined, spawnProcess), /cannot open display/)
})

test('treats empty output as a cancellation instead of an empty path', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, () => ({ output: '   \n' }))
  assert.equal(await pickDirectory('linux', undefined, spawnProcess), null)
})

test('reports an unavailable picker when every executable is missing', async () => {
  const runs: FakeRun[] = []
  const { spawnProcess } = fakeSpawn(runs, () => ({ error: missingExecutable() }))
  await assert.rejects(
    () => pickDirectory('linux', undefined, spawnProcess),
    FolderPickerUnavailableError,
  )
  assert.deepEqual(runs.map(({ command }) => command), ['zenity', 'kdialog', 'yad'])
})
