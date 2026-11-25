import { contrastColor, type ThemePalette } from './themes.ts'

/** Pi wordmark shared with `public/favicon.svg`, the pre-JavaScript fallback. */
const piMark = 'M17 20h30M23 20v25M41 20v25'

/**
 * Builds the tab favicon as a `data:` URL so the icon follows the active theme: the accent fills
 * the rounded square and its contrast colour draws the mark. `width`/`height` are declared because
 * the completion badge rasterises the icon through a canvas.
 */
export function themeFaviconHref(palette: ThemePalette): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"'
    + ' width="64" height="64">'
    + `<rect width="64" height="64" rx="17" fill="${palette.accent}"/>`
    + `<path d="${piMark}" fill="none" stroke="${contrastColor(palette.accent)}"`
    + ' stroke-linecap="round" stroke-linejoin="round" stroke-width="7"/>'
    + '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
