# Notifications

`ToastStack` renders transient application notices and errors. `App.tsx` owns notification state
because backend connectivity, sessions, commands, and multiple features all publish messages.
Features report failures through callbacks such as `onError`; they do not create a parallel global
notification store.

Each toast has a stable id, a `notice` or `error` kind, a message, and an optional session identity.
`App.tsx` filters visibility for the selected session and coordinates dismissal timing.
`ToastStack` owns only accessible rendering: notices use status semantics, errors use alert
semantics, and every item remains explicitly dismissible.

Keep notification state and cross-feature policy in `App.tsx`. Keep presentation and colocated
styles in this directory.

## Tab attention

`tab-attention.ts` owns the browser-tab completion badge: a red dot composited onto the current
favicon, the way Discord marks unread tabs. `App.tsx` keeps the badge up while an unseen completion
exists (`unseenCompletion`), from two sources: an unopened completion tracked by
`completedSessionIds`, and `hiddenSessionCompleted`, which covers the session already on screen
settling while nobody watched the tab.

The sidebar stays the single rule for the first source: `hasUnseenCompletion` reuses the `complete`
branch of `sessionIndicator`, so the session on screen is never marked, whatever a restored marker
still names, and completions of sessions that no longer exist are ignored. The badge therefore
cannot disagree with the sidebar, and it clears on the next render after that session is opened.
`hiddenSessionCompleted` is a display-only flag, so it is cleared the moment the tab is watched
again: `visibilitychange` and window `focus` re-check `tabUnwatched()`, the flag re-checks itself
immediately when it is set, and any `pointerdown`/`keydown` ends it. No event is trusted on its own,
so a settle processed just as the tab regains focus cannot leave the badge stuck.

The base icon follows the active theme: `setBaseFavicon` receives the `data:` URL built by
`theme-favicon.ts` from the palette accent and its contrast colour, and `App.tsx` plus the Settings
theme preview call it on every theme change. While the badge is up a new base recomposes it, so a
live theme change keeps the marker visible and restoring brings back the right icon. Keeping the
badge on a canvas instead of shipping a second icon file keeps one source of truth: the module
rasterises the recorded base favicon, draws the badge in its bottom-right corner, and hands the
result back as a `data:` URL. Compositions are cached per base href and ring colour, and a write
counter prevents a slower composition from overwriting a newer one.

The badge ring uses `--on-accent` so the dot stays readable on saturated accents, which fill the
themed icon. `public/favicon.svg` remains the pre-JavaScript fallback and declares `width`/`height`
so browsers rasterise it at its intrinsic size in the canvas.

The marker is deliberately non-intrusive: it never requests the browser notification permission and
never shows a system notification. The document title stays untouched, so the tab keeps its plain
name; only the favicon changes.

Focused tests: `hasUnseenCompletion` is covered in `test/session-indicator.test.ts`; the favicon URL
is covered in `test/themes.test.ts`. The module itself only touches icon links and visibility APIs.
