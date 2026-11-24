# Plan panel

The plan panel shows the macro plan Pi committed for the current task. It stays above the composer while Pi works, expands to the full step list on demand, and moves directly after the final `update_plan` call in the conversation when the plan completes.

## Contract with Pi

`pi-extensions/plan.ts` registers the `update_plan` tool and adds one short `planning` section to the system prompt, because a tool that is only advertised in the tool list is rarely adopted. Every accepted call replaces the complete plan, so an update needs no identifier, no diff, and no merge rule. `shared/plan.ts` validates both the model's arguments and the payload the interface reads, and writes the reminder that closes a forgotten plan.

- 2 to 8 steps, at most one `in_progress`, at most 120 characters per step;
- statuses are `pending`, `in_progress`, `completed`, and `skipped`;
- steps are written in the language the user writes in, and their text stays stable so the panel keeps their timing;
- a rejected call returns an error to the model and keeps the previous plan;
- a different plan may not silently replace an unfinished one: a call that shares no step text with the active plan is rejected with the steps it must close first (`abandonsActivePlan`), so the model transitions the existing steps or closes them explicitly before committing a fresh plan; a completed plan is superseded freely, a human message ends the task its plan tracks, and extension-authored reminders never do;
- the tool acknowledges one line of progress so the model never maintains its own count, and names the step to work on next so it transitions the plan instead of finishing every step in one final call.
- a busy turn forgets the plan it committed, so after `planStaleToolCalls` tool calls without an update the extension appends one hidden reminder at `turn_end` that reports the plan's actual state back (`planStaleReminder`); each accepted update re-arms it, so one staleness episode never produces more than one reminder;
- a model that kept working without updating its plan would still settle with the last step in progress, so the extension injects one hidden reminder before settling and one continuation buys it a request to close the plan; an aborted run, a closed plan, and a plan written as the last action get none.

The normalized plan travels in the tool result's `details`. Pi persists `details` in the session, keeps them out of the model context, and forwards them in `tool_execution_end` events, so the panel needs no extension memory, no status channel, and no backend cache.

## Data flow

- **Opening or reloading a session:** `planFromMessages()` in `plan-state.ts` reads the latest plan for the active task. `plansByTurnUsage()` also reconstructs each historical turn's last accepted plan from persisted tool results, so prior panels survive new user messages, compaction, and reopening.
- **While Pi works:** `useConversationRuntime` reads the same payload from `tool_execution_end` and updates the panel immediately.
- **Starting a new turn:** the runtime clears the live plan when the composer adds an optimistic user message, and `planFromMessages()` ignores plans older than the last user message. `Conversation.tsx` renders a completed panel directly after its final `update_plan` tool call and retains a usage-row fallback only when an automatic snapshot temporarily omits that call. A new task hides the live panel without removing earlier panels.

## States

- `active` — at least one step is pending or in progress; the header shows the one-based current step as `1/n`, while each row keeps its original status symbol.
- `complete` — every step is `completed` or `skipped`; the header reads "All steps done". The panel moves from above the composer directly after the final `update_plan` call in the conversation, without waiting for the assistant response to finish.
- `paused` — Pi settled with unfinished steps. The plan stays temporarily above the composer with a `paused` note; it is not archived as a historical panel. A later user turn clears it, while the conversation's `update_plan` call remains in the tool history. Starting another turn does not resume its clock or clear `paused` until Pi commits a fresh `update_plan`.

`useConversationRuntime` tracks Pi's `agent_start` and `agent_settled` events, so Livecraft pauses and resumes the displayed plan and its clock automatically with the agent turn; no extra agent tool call is needed. A settle missed while the backend or manager was down would leave the turn stuck as running, so every applied snapshot also reconciles the turn from Pi's own `isStreaming`/`isCompacting`/`pendingMessageCount` state (`agent-turn.ts`) when it was fetched after the newest applied agent event, and a `manager_connected` event re-reads the selected session. `App.tsx` unmounts the composer panel when the final update completes; `Conversation.tsx` mounts the completed panel after that call, so there is never a duplicate while Pi finishes its answer. Its content is already inset to the message column, so the panel keeps the same width as its composer placement. Historical panels use the timing values persisted in each plan payload and do not overwrite the live panel's timing store. `PlanPanel.tsx` owns folding: it stores the identity of the folded plan (`planIdentity()`, the step texts) in `localStorage`, so status changes keep the panel folded and a different plan reopens once.

## Timing

`shared/plan-clock.ts` measures active time for the plan as a whole and for each step. The clock only runs between `agent_start` and `agent_settled`, and the plan total stops once every step is done, so the answer Pi writes after the last step is never billed. The extension folds the elapsed time at each transition and at each settle, and reports the plan total as `activeMs` alongside the `recordedAt` instant and the per-step `activeMs` in `details`.

- the header always shows the plan total, including `0s` before the first second; each row shows its step's time once the step has started, `0s` included — a step not yet started shows none;
- between updates the panel runs the timer locally, and each payload raises the known time to the authoritative value;
- a snapshot refresh can resend a payload older than time the panel already folded, so the panel keeps the larger value until Pi reports more;
- historical panels use their turn's persisted timing payload and remain visible through incomplete automatic snapshots;
- replacing a step with different text starts a new step, so the old time goes with it;
- a plan that shares no step with the previous one — or that starts with no finished step after a completed one — starts a fresh total, so a new task never inherits the previous clock;
- a reload resumes the timer instead of restarting it: the first run of a mounted panel starts at the later of the payload's `recordedAt` and the stored `savedAt` instant, so the window a restored timing already covers is never counted twice;
- while the run continues the live clock follows each payload's `recordedAt` (`planRunBase()`), the instant its reported timings are accurate to, and only the settle folds the uncovered tail — so a snapshot refresh never re-counts folded time, and the wait while the plan is paused is never billed;
- `plan-clock-store.ts` keeps the folded time in browser storage on `pagehide`, so a paused plan also survives a refresh; a new turn clears that entry, so a later plan never inherits it.

`PlanClock` is covered in `test/plan.test.ts` with the pause, completion, restore, and replacement cases.

## Deliberate limits

- No server route, no manager change: the session file is the only store.
- A blocking Pi dialog inside a run (`ask_user_question`, a confirmation) counts as active time: Pi keeps the run open, so neither the clock nor the panel can see the wait.
- The conversation still renders the call as a compact `3/6 · current step` card in semi-detailed and detailed views.
- Pi's terminal interface shows only the one-line acknowledgement; the panel is a Livecraft surface.

Focused coverage: `test/plan.test.ts` (parsing, derivation, timing, presentation).
