# Workspace and sessions

`useWorkspaceSessions` owns the workspace sections, the session lists they contain, and the active workspace. It coordinates refreshes, creation, reopening, renaming and closing, optimistic naming, pending UI requests, and the local persistence of workspaces, collapsed sections, recent activity, and completed sessions.

There is no main workspace. Sections are built by `workspace-groups.ts` from every session with a persisted file plus the folders the user added explicitly, ordered by newest activity. A section is named after its folder basename and qualified by its parent only when two sections share it. `workspacePaths` keeps explicitly added folders so a section survives even when it has no sessions left.

The active workspace follows the selected session and falls back to the last one used, which keeps Git, todos, quotas, terminal, prompt templates, and the right sidebar in a stable context while the user browses sections. `App.tsx` receives that path as `workspacePath` and supplies cross-feature callbacks such as resetting workspace-scoped state; it must not duplicate the controller's state.

Sessions are created through `NewSessionDialog`, which reaches the host's native folder dialog through `pickDirectory()`, or from the `＋` button of a section. Typed paths with completion stay available because a headless host may not provide any native dialog. Workspace paths accept both `~/...` and Windows `~\...`; `directory-completion.ts` preserves the separator style the user typed.

Pure list, naming, and grouping rules live in `workspace-groups.ts`; the sibling-navigation rule lives in `sidebar-sessions.ts`.
