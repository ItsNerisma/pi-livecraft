/** Discord-style unread badge drawn over the current favicon. */
const badgeColor = '#f23f43'
/** Separates the badge from the themed favicon underneath, including saturated accents. */
const badgeRingWidth = 2
const canvasSize = 64
const badgeCenterRatio = 0.78
const badgeRadiusRatio = 0.22
/** Used until the themed favicon is applied; mirrors `public/favicon.svg`. */
const defaultFaviconHref = '/favicon.svg'

/** Reports whether the user is currently watching this tab and its window. */
export function tabUnwatched(): boolean {
  return document.hidden || !document.hasFocus()
}

function iconLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
}

/** Composed badges keyed by source favicon and ring colour, so one data URL serves a whole theme. */
const composedHrefs = new Map<string, Promise<string | undefined>>()
/** The unbadged favicon of the active theme, recorded by {@link setBaseFavicon}. */
let baseHref = defaultFaviconHref
let attentionActive = false
/** Increments on every write so a slower composition cannot overwrite a newer one. */
let writeVersion = 0

/** The theme colour that keeps the badge readable over its own accent background. */
function badgeRingColor(): string {
  const declared = getComputedStyle(document.documentElement).getPropertyValue('--on-accent')
  return declared.trim() || '#ffffff'
}

/** Draws the current favicon with a badge in the bottom-right corner, like Discord. */
async function composeAttentionFavicon(
  sourceHref: string,
  ringColor: string,
): Promise<string | undefined> {
  try {
    const image = new Image()
    image.src = sourceHref
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvasSize
    canvas.height = canvasSize
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.drawImage(image, 0, 0, canvasSize, canvasSize)
    const center = canvasSize * badgeCenterRatio
    const radius = canvasSize * badgeRadiusRatio
    context.beginPath()
    context.arc(center, center, radius + badgeRingWidth, 0, Math.PI * 2)
    context.fillStyle = ringColor
    context.fill()
    context.beginPath()
    context.arc(center, center, radius, 0, Math.PI * 2)
    context.fillStyle = badgeColor
    context.fill()
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

function attentionHrefFor(sourceHref: string): Promise<string | undefined> {
  const ringColor = badgeRingColor()
  const key = `${ringColor}\n${sourceHref}`
  const cached = composedHrefs.get(key)
  if (cached) return cached
  const composed = composeAttentionFavicon(sourceHref, ringColor)
  composedHrefs.set(key, composed)
  return composed
}

/** Points every icon link at `href` and supersedes any composition still in flight. */
function writeFavicons(href: string): void {
  writeVersion += 1
  for (const link of iconLinks()) link.href = href
}

/** Draws the badge over `sourceHref`, unless a newer write superseded it meanwhile. */
function applyAttentionBadge(sourceHref: string): void {
  const version = ++writeVersion
  void attentionHrefFor(sourceHref).then((href) => {
    if (!attentionActive || version !== writeVersion || !href) return
    for (const link of iconLinks()) link.href = href
  })
}

/**
 * Records the unbadged favicon of the active theme, so the tab icon follows the palette instead of
 * a static file. While the badge is up it is recomposited over the new base: a live theme change
 * keeps the marker visible and restoring it later brings the right icon back.
 */
export function setBaseFavicon(href: string): void {
  baseHref = href
  if (attentionActive) {
    applyAttentionBadge(href)
    return
  }
  writeFavicons(href)
}

/**
 * Shows or clears the unattended-completion badge on the favicon. The title is left untouched.
 * Idempotent: clearing restores the base favicon recorded by {@link setBaseFavicon}.
 */
export function setTabAttention(attention: boolean): void {
  attentionActive = attention
  if (attention) {
    applyAttentionBadge(baseHref)
    return
  }
  writeFavicons(baseHref)
}
