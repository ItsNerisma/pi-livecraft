# Plan panel

The plan panel shows the macro plan Pi committed for the current task, directly above the composer. It stays out of the way while Pi works, expands to the full step list on demand, and folds away once the turn is over.

## Contract with Pi

`pi-extensions/plan.ts` registers the `update_plan` tool. Every call replaces the complete plan, so an update needs no identifier, no diff, and no merge rule. `shared/plan.ts` validates both the model's arguments and the payload the interface reads.

- 2 to 8 steps, at most one `in_progress`, at most 120 characters per step;
- statuses are `pending`, `in_progress`, `completed`, and `skipped`;
- a rejected call returns an error to the model and keeps the previous plan;
- the tool acknowledges one line of progress so the model never maintains its own count.

The normalized plan travels in the tool result's `details`. Pi persists `details` in the session, keeps them out of the model context, and forwards them in `tool_execution_end` events, so the panel needs no extension memory, no status channel, and no backend cache.

## Data flow

- **Opening or reloading a session:** `planFromMessages()` in `plan-state.ts` reads the last accepted plan from `snapshot.messages`. Pi's active branch keeps pre-compaction entries, so the plan survives compaction, forking, and reopening.
- **While Pi works:** `useConversationRuntime` reads the same payload from `tool_execution_end` and updates the panel immediately.
- **Starting a new turn:** the runtime clears the plan when the composer adds an optimistic user message, and `planFromMessages()` ignores a plan older than the last user message. A plan committed after that message reappears.

## States

- `active` — at least one step is pending or in progress; the header shows progress and the current step.
- `complete` — every step is `completed` or `skipped`; the header reads "All steps done".
- `paused` — Pi is not running and the plan is unfinished; the header carries a `paused` note instead of pretending the step is moving.

`PlanPanel.tsx` owns folding: it stores the identity of the folded plan (`planIdentity()`, the step texts) in `localStorage`, so a status change keeps the panel folded and a different plan reopens once.

## Deliberate limits

- No server route, no manager change: the session file is the only store.
- The conversation still renders the call as a compact `3/6 · current step` card in semi-detailed and detailed views.
- Pi's terminal interface shows only the one-line acknowledgement; the panel is a Livecraft surface.

Focused coverage: `test/plan.test.ts`.
