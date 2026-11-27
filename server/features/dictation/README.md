# Dictation

Turns a composer recording into text with local whisper.cpp, then optionally rewrites the transcript surface-only in a disposable Pi process.

## Boundaries

- `server/features/dictation/transcription.ts` owns prerequisite detection, the ffmpeg conversion, the whisper.cpp invocation, and output parsing. It never ships a model: the binary and the model live on the user's machine.
- `server/backend.ts` owns the routes: `GET /api/transcription` reports prerequisites, `POST /api/transcription/model` downloads one model, and `POST /api/sessions/:id/transcription` accepts a base64 clip and returns the text. Request parsing, size limits, and language validation stay in the route.
- `dictation-cleanup-system.txt` is the cleanup prompt. It is read from disk on every request, so edits apply without restarting the backend.
- `src/features/composer/composer-dictation.ts` owns microphone recording, the `pi-livecraft.dictation` preferences, and caret-aware draft insertion. It records at 24 kbit/s, which keeps long clips small without hurting recognition, since whisper.cpp downsamples to 16 kHz mono anyway.
- One recording may carry 1.5 MB of audio, about eight minutes at that bitrate. The cap stays under the backend's shared 2 MiB JSON body limit, which base64 inflates a recording by a third towards.

## Prerequisites

Detection resolves, in order:

1. `PI_LIVECRAFT_WHISPER_BIN`, then `whisper-cli`, `whisper-cpp`, or `main` on `PATH`.
2. `PI_LIVECRAFT_WHISPER_MODEL`, then `ggml-base.bin`, `ggml-small.bin`, or `ggml-tiny.bin` under the user's data and cache directories.
3. `ffmpeg` on `PATH`, used to convert the browser's compressed recording to 16 kHz mono WAV.

`GET /api/transcription` returns the resolved paths, an `available` flag, a remediation `hint`, the package command for this host, the managed model directory, and the downloadable model sizes. Nothing is installed with elevated rights from the UI: the guided setup copies the package command, downloads the model, and re-checks.

The guided setup writes models into `<XDG_DATA_HOME or ~/.local/share>/pi-livecraft/models`, which detection scans, so a downloaded model needs no environment variable. `src/features/composer/DictationSetupDialog.tsx` owns that dialog; the microphone button opens it whenever the prerequisites are incomplete.

## Cleanup

The cleanup pass is a short-lived isolated Pi prompt that edits surface only: punctuation, hesitations, explicit self-corrections, and unambiguous misheard identifiers. It must never reword, answer, or add facts. A failed or empty rewrite returns the raw transcript with `cleanupError`, so a dictation is never lost.

It stays off until the user enables it in the Dictation settings, because it is a second model call that costs about as much time as the recognition itself.

## Tests

`test/dictation.test.ts` covers output parsing, MIME mapping, prerequisite detection with a fake install, status reporting when nothing is installed, and a model downloaded into the managed directory. `test/composer-dictation.test.ts` covers caret-aware insertion and language normalization.
