# Shared components

## Tooltip

A portal-based tooltip that renders outside the normal DOM hierarchy to avoid clipping by overflow containers. Use it instead of native HTML `title` attributes for consistent styling and behavior.

### When to use

- Interactive elements (buttons, links) that need a descriptive label on hover
- Truncated text where the full content should appear on hover
- Any element where a native browser tooltip would be insufficient (styling, timing, positioning)

### When not to use

- Non-interactive decorative elements that don't need additional context
- Elements where the visible text already conveys the full meaning

### Usage

```tsx
import { Tooltip } from '../../components/Tooltip.tsx'

<Tooltip label="Full description here">
  <button>Short</button>
</Tooltip>
```

The tooltip appears after a short delay (600ms) to avoid flickering during quick pointer movements. It fades in/out with a subtle slide animation.

### Implementation notes

- Renders via `createPortal` to `document.body`, so sidebar or modal overflow won't clip it
- Position recalculates on scroll and resize
- Automatically flips below the trigger if there's insufficient space above

## Code highlighting

`CodeHighlighter.tsx` wraps `react-syntax-highlighter`'s Prism build with the palette variables of the active theme. It registers bash, C#, CSS, JavaScript, JSON, Markdown, markup, and TypeScript; every other language stays plain text.

`code-language.ts` maps file extensions to those registered languages. Use `codeLanguageForPath()` instead of duplicating the extension list.

`CodeLines.tsx` renders a list of code lines with one highlighter pass per list, so multi-line constructs keep their colors. It accepts a `renderLine` callback for the caller's gutter, sign, or card markup, and a `changedClassName` callback for the words changed by an intra-line diff. Lines keep their word-level highlights when the language is unsupported or while the highlighter loads lazily. Callers supply the content and segments; the component maps highlighter rows back to lines and merges the two highlight layers.
