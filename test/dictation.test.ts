import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  audioExtension,
  parseWhisperOutput,
  transcriptionStatus,
} from '../server/features/dictation/transcription.ts'

test('strips whisper.cpp timestamps and joins segments into one line', () => {
  const output = [
    'whisper_init_from_file_with_params_no_state: loading model',
    '[00:00:00.000 --> 00:00:02.400]   Fix the composer',
    '[00:00:02.400 --> 00:00:04.100]   dictation.',
    '',
  ]
    .join('\n')
  assert.equal(parseWhisperOutput(output), 'Fix the composer dictation.')
})

test('returns an empty string when the recogniser produced nothing', () => {
  assert.equal(parseWhisperOutput('  \n\n '), '')
})

test('maps the recorded MIME types onto file extensions', () => {
  assert.equal(audioExtension('audio/webm;codecs=opus'), 'webm')
  assert.equal(audioExtension('audio/ogg'), 'ogg')
  assert.equal(audioExtension('AUDIO/WAV'), 'wav')
})

test('rejects a non-audio MIME type', () => {
  assert.equal(audioExtension('video/mp4'), undefined)
})

test('reports a missing binary and model as unavailable, with a hint', async () => {
  const status = await transcriptionStatus({
    PATH: '',
    PI_LIVECRAFT_WHISPER_BIN: '/nonexistent/whisper-cli',
    PI_LIVECRAFT_WHISPER_MODEL: '/nonexistent/ggml-base.bin',
  })
  assert.equal(status.available, false)
  assert.equal(status.binary, null)
  assert.equal(status.model, null)
  assert.ok(status.hint.includes('whisper.cpp'))
})

test('detects an installed binary, model, and ffmpeg', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-livecraft-whisper-status-'))
  try {
    const fakeBinary = join(directory, 'whisper-cli')
    const fakeFfmpeg = join(directory, 'ffmpeg')
    const model = join(directory, 'ggml-base.bin')
    await writeFile(fakeBinary, '#!/bin/sh\n')
    await writeFile(fakeFfmpeg, '#!/bin/sh\n')
    await writeFile(model, '')
    await chmod(fakeBinary, 0o755)
    await chmod(fakeFfmpeg, 0o755)
    const status = await transcriptionStatus({
      PATH: directory,
      PI_LIVECRAFT_WHISPER_BIN: '',
      PI_LIVECRAFT_WHISPER_MODEL: model,
    })
    assert.equal(status.available, true)
    assert.equal(status.binary, fakeBinary)
    assert.equal(status.model, model)
    assert.equal(status.ffmpeg, true)
    assert.equal(status.hint, '')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
