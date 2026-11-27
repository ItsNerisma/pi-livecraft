/** Only languages registered by CodeHighlighter are listed; other files stay plain. */
const languageByExtension: Record<string, string> = {
  bash: 'bash',
  cjs: 'javascript',
  cs: 'csharp',
  css: 'css',
  htm: 'markup',
  html: 'markup',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  md: 'markdown',
  markdown: 'markdown',
  mjs: 'javascript',
  sh: 'bash',
  svg: 'markup',
  ts: 'typescript',
  tsx: 'typescript',
  xml: 'markup',
  zsh: 'bash',
}

/** Returns the highlighter language for a repository path, or undefined for plain text. */
export function codeLanguageForPath(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const extension = path.match(/\.([^./]+)$/)?.[1]?.toLowerCase()
  return extension ? languageByExtension[extension] : undefined
}
