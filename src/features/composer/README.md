# Composer

Follow the [step-by-step guide](/docs/HOW-TO-COMPOSER.md) to add a button,
dropdown, or stat. Isolated draft rewrites use the same [isolated prompt](/docs/HOW-TO-RUN-ISOLATED-PROMPT.md)
mechanism; see its guide before changing that flow. Return here for the data flow and internal
state reference below.

## Data flow

`App.tsx` → props → `Composer.tsx` → `onSend()` / `onCommand()` / `onAbort()` /
`onImprovePrompt()` / `onSavePrompt()` → `src/api.ts` → backend or Pi

All data arrives through props. The Composer never calls the backend directly.

## Sub-modules

| Module | Purpose |
|---|---|
| `Composer.tsx` | Form, textarea, images, slash-commands, send/stop, assembly |
| `composer.css` | All composer styles |
| `composer-images.ts` | Image paste, resize, compress (`maxComposerImages` = 4) |
| `composer-dictation.ts` | Microphone recording, `pi-livecraft.dictation` preferences |
| `DictationSetupDialog.tsx` | Guided whisper.cpp setup: prerequisite checklist, copiable command, model download |
| `composer-utils.ts` | Label/token formatting, command detection, compact-command fallback, prompt delivery mapping, draft loading, `isObject` |
| `goal-mode.ts` | Detects the `pi-goal` `/goal` command and reads the goal it publishes from `pi-goal-event` messages |
| `GoalBanner.tsx` | Goal bar above the composer: short objective, pi-goal state, resume and clear controls |
| `prompt-title.ts` | Immediate session title, replaced later by Pi's extension title |
| `selects/ComposerSelect.tsx` | Generic Radix Select wrapper with tone-based icons |
| `selects/AgentSelect.tsx` | Agent picker — derives label from options, calls `onAgentChange` |
| `selects/ModelSelect.tsx` | Model picker — builds RPC `set_model` command from selection |
| `selects/ThinkingSelect.tsx` | Thinking level — maps level to `set_thinking_level` RPC |
| `selects/PromptSelect.tsx` | Prompt templates — previews, inserts, and saves Pi-discovered templates |
| `selects/BehaviorSelect.tsx` | Steer / Interrupt / Follow-up select, only rendered while Pi is running |
| `status-bar/ComposerStatusBar.tsx` | Layout container for session info and stats |
| `status-bar/SessionInfo.tsx` | Session name, cwd, active status dot |
| `status-bar/SessionStats.tsx` | Cost and context usage with progress bar |

## Internal state

- `message`, `images` — the draft; persisted to `localStorage` per session
  (`pi-livecraft.composer-draft.<sessionId>`).
- `slashOpen`, `slashFilter`, `slashIndex` — slash-command popover.
- `openSelect` — which dropdown (agent/model/thinking) is open.
- Goal mode delegates to the [`pi-goal`](https://github.com/Michaelliv/pi-goal) extension and stays hidden when it is not installed. The toggle arms the next message as `/goal <objective>`; the extension owns persistence, continuation, budgets, and completion. Livecraft reads the goal back from the visible `pi-goal-event` custom messages (`details.goal`), so a goal started from the Pi TUI also appears here. The banner shows the objective while the goal is active or paused, sends `/goal resume` or `/goal clear`, and disappears when the extension reports completion or clearing.
- `behavior` — `steer`, `interrupt`, or `followUp`; only visible while Pi is running.
  `steer` and `followUp` travel as `streamingBehavior`; `interrupt` sends `abort`
  first, waits for Pi to become idle, then sends a plain `prompt`.
- `submitting` — prevents double-send during the API call.
- `preparingImages` — blocks send while clipboard images are being converted.
- `improving`, `improvePreset`, `suggestion` — isolated rewrite request and explicit comparison.
- `previewingPrompt`, `savedPrompts`, `promptSave`, `savingPrompt` — prompt preview and save flow.
- `dictating` — `idle`, `recording`, or `transcribing`; the microphone button and
  `submit()` share it, so sending during a recording transcribes first.

## Selects

The agent, model, thinking, and prompt dropdowns each live in `selects/` as standalone
components. `ComposerSelect` is the generic Radix Select wrapper they all use.
Each select encapsulates its own option derivation and `onValueChange` logic.
`onCommand()` sends the corresponding RPC command (`set_model`,
`set_thinking_level`) to Pi. `PromptSelect` previews and inserts templates, and saves the
current draft through `onSavePrompt()`.

## Draft persistence

Each session has one draft in `localStorage`. Drafts are cleared on successful
send and restored on failure.
