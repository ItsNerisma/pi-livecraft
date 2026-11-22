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

`tab-attention.ts` owns the browser-tab completion marker: a dot prefix in the document title plus a
red badge composited onto the current favicon, the way Discord marks unread tabs. `App.tsx` raises
the marker from the `agent_settled` Pi event only while the tab is unwatched (`tabUnwatched()`), and
clears it as soon as the tab becomes visible again (the next `visibilitychange` or window `focus`).

Surrounding the badge on a canvas instead of shipping a second icon file keeps one source of truth
for the favicon: the module rasterises whatever `link[rel~="icon"]` currently points at, draws the
badge in its bottom-right corner, and hands the result back as a `data:` URL. Original hrefs are
captured before the swap so clearing restores them exactly; compositions are cached per source href.
`public/favicon.svg` therefore declares `width`/`height` so browsers rasterise it at its intrinsic
size in the canvas.

The marker is deliberately non-intrusive: it never requests the browser notification permission and
never shows a system notification. The title updates synchronously while the badge waits for the
icon to decode, and `setTabAttention` is idempotent because it strips the existing marker from the
live title instead of caching the application name, so `index.html` stays the single source of the
title. If the canvas path is unavailable, the title marker alone still signals the completion.

Focused tests: none; the module only touches `document.title`, icon links, and visibility APIs.
