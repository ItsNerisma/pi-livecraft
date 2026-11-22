/** Title marker shown while an unseen agent completion waits in the tab. */
const attentionPrefix = '● '
const faviconHref = '/favicon.svg'
const attentionFaviconHref = '/favicon-attention.svg'

/**
 * Removes the attention marker from the current document title.
 * Reading the live title keeps the original name authoritative instead of duplicating it here.
 */
function baseTitle(): string {
  const title = document.title
  return title.startsWith(attentionPrefix) ? title.slice(attentionPrefix.length) : title
}

/** Reports whether the user is currently watching this tab and its window. */
export function tabUnwatched(): boolean {
  return document.hidden || !document.hasFocus()
}

/**
 * Shows or clears the unattended-completion marker in the browser tab.
 * Idempotent: the base title and favicon are restored by reading their current values.
 */
export function setTabAttention(attention: boolean): void {
  document.title = attention ? `${attentionPrefix}${baseTitle()}` : baseTitle()
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
    link.href = attention ? attentionFaviconHref : faviconHref
  }
}
