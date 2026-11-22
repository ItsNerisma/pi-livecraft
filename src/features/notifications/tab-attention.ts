/** Discord-style unread badge drawn over the current favicon. */
const badgeColor = '#f23f43'
const canvasSize = 64
const badgeCenterRatio = 0.78
const badgeRadiusRatio = 0.22

/** Reports whether the user is currently watching this tab and its window. */
export function tabUnwatched(): boolean {
  return document.hidden || !document.hasFocus()
}

function iconLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
}

/** Favicon URLs captured before the badge replaced them. */
const originalHrefs = new WeakMap<HTMLLinkElement, string>()
/** Composed badges keyed by source favicon, so repeated completions reuse one data URL. */
const composedHrefs = new Map<string, Promise<string | undefined>>()
let attentionActive = false

/** Draws the current favicon with a badge in the bottom-right corner, like Discord. */
async function composeAttentionFavicon(sourceHref: string): Promise<string | undefined> {
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
    context.beginPath()
    context.arc(
      canvasSize * badgeCenterRatio,
      canvasSize * badgeCenterRatio,
      canvasSize * badgeRadiusRatio,
      0,
      Math.PI * 2,
    )
    context.fillStyle = badgeColor
    context.fill()
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

function attentionHrefFor(sourceHref: string): Promise<string | undefined> {
  const cached = composedHrefs.get(sourceHref)
  if (cached) return cached
  const composed = composeAttentionFavicon(sourceHref)
  composedHrefs.set(sourceHref, composed)
  return composed
}

/**
 * Replaces the icon links with the badge and remembers their original hrefs.
 * The original is read from the live link, so the badge follows any favicon change automatically.
 */
function showAttentionFavicon(href: string): void {
  for (const link of iconLinks()) {
    if (!originalHrefs.has(link)) originalHrefs.set(link, link.href)
    link.href = href
  }
}

/** Restores the favicons captured before the badge replaced them. */
function restoreFavicons(): void {
  for (const link of iconLinks()) {
    const original = originalHrefs.get(link)
    if (original) link.href = original
  }
}

/**
 * Shows or clears the unattended-completion badge on the favicon. The title is left untouched.
 * Idempotent: clearing reuses the hrefs captured before the badge replaced them.
 */
export function setTabAttention(attention: boolean): void {
  attentionActive = attention
  if (!attention) {
    restoreFavicons()
    return
  }
  const [link] = iconLinks()
  const source = (link && originalHrefs.get(link)) || link?.href || '/favicon.svg'
  void attentionHrefFor(source).then((href) => {
    if (attentionActive && href) showAttentionFavicon(href)
  })
}
