// TeX block environments currently supported by this renderer.
const SUPPORTED_BLOCK_ENVS = ['itemize', 'enumerate', 'lstlisting', 'center', 'tabular'] as const

type BlockEnvironment = (typeof SUPPORTED_BLOCK_ENVS)[number]

type InlineCommandResult = {
  html: string
  end: number
}

export type RenderTexStatementOptions = {
  // MathJax typesetting is opt-in to keep parsing side-effect free by default.
  typeset?: boolean
  // Optional container(s) to scope MathJax typesetting instead of whole document.
  typesetTarget?: Element | Element[] | null
}

type MathJaxLike = {
  typesetPromise?: (elements?: Element[]) => Promise<unknown>
  typesetClear?: (elements?: Element[]) => void
  tex?: {
    inlineMath?: Array<[string, string]>
    displayMath?: Array<[string, string]>
    processEscapes?: boolean
  }
  svg?: {
    fontCache?: string
  }
}

declare global {
  interface Window {
    MathJax?: MathJaxLike
  }
}

const STYLE_TAGS: Record<string, 'strong' | 'em' | 'code' | 'u' | 's' | 'span'> = {
  bf: 'strong',
  textbf: 'strong',
  it: 'em',
  textit: 'em',
  t: 'code',
  tt: 'code',
  texttt: 'code',
  emph: 'u',
  underline: 'u',
  sout: 's',
  textsc: 'span',
}

const SIZE_COMMANDS = new Set([
  'tiny',
  'scriptsize',
  'small',
  'normalsize',
  'large',
  'Large',
  'LARGE',
  'huge',
  'Huge',
])

// Strict HTML allowlist used by sanitizeHtml.
const ALLOWED_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'footer',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'tr',
  'u',
  'ul',
])

// Attribute allowlist per tag. Any missing attribute is dropped.
const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  td: new Set(['colspan', 'rowspan']),
}

let mathJaxLoadPromise: Promise<MathJaxLike | null> | null = null
let mathJaxTypesetScheduled = false
let pendingMathJaxTargets: Element[] | null = null
let pendingMathJaxGlobalTypeset = false
const MATHJAX_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js'
const MATHJAX_SCRIPT_INTEGRITY = ''
const MATHJAX_LOAD_TIMEOUT_MS = 8000

/**
 * Convert TeX/LaTeX text into sanitized HTML.
 *
 * The function keeps math payloads (`$...$`, `$$...$$`) intact in output.
 * MathJax typesetting is opt-in through options to keep this parser pure.
 */
export function renderTexStatement(tex: string, options: RenderTexStatementOptions = {}): string {
  const normalized = String(tex ?? '').replace(/\r\n/g, '\n')
  const rawHtml = parseBlocks(normalized).join('')
  const html = sanitizeHtml(rawHtml)

  if (options.typeset) {
    const scopedTargets = normalizeTypesetTargets(options.typesetTarget)
    scheduleGlobalMathTypeset(scopedTargets)
  }

  return html
}

function normalizeTypesetTargets(typesetTarget: RenderTexStatementOptions['typesetTarget']): Element[] | undefined {
  if (!typesetTarget) {
    return undefined
  }

  const candidates = Array.isArray(typesetTarget) ? typesetTarget : [typesetTarget]
  const targets = candidates.filter((target): target is Element => Boolean(target))
  return targets.length > 0 ? targets : undefined
}

/**
 * Parse top-level block structures (paragraphs, environments, epigraph).
 * Falls back to paragraph rendering if malformed blocks are encountered.
 */
function parseBlocks(text: string): string[] {
  const html: string[] = []
  const blockStartRegex = /\\begin\{(itemize|enumerate|lstlisting|center|tabular)\}|\\epigraph\{/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = blockStartRegex.exec(text)) !== null) {
    if (match.index > last) {
      html.push(...renderParagraphChunk(text.slice(last, match.index)))
    }

    if (match[1]) {
      const envName = match[1] as BlockEnvironment
      const env = findEnvironment(text, match.index, envName)
      if (!env) {
        html.push(...renderParagraphChunk(text.slice(match.index)))
        break
      }

      if (envName === 'tabular') {
        let spec = ''
        let contentStart = env.innerStart
        const specGroup = parseBraced(text, contentStart)
        if (specGroup) {
          spec = specGroup.content
          contentStart = specGroup.end
        }

        const tabularContent = text.slice(contentStart, env.innerEnd)
        html.push(renderTabular(spec, tabularContent))
      } else if (envName === 'itemize' || envName === 'enumerate') {
        const listContent = text.slice(env.innerStart, env.innerEnd)
        html.push(renderList(envName, listContent))
      } else if (envName === 'lstlisting') {
        const code = text.slice(env.innerStart, env.innerEnd).replace(/^\n+|\n+$/g, '')
        html.push(`<pre><code>${escapeHtml(code)}</code></pre>`)
      } else if (envName === 'center') {
        const centered = text.slice(env.innerStart, env.innerEnd)
        html.push(`<div>${parseBlocks(centered).join('')}</div>`)
      }

      last = env.end
      blockStartRegex.lastIndex = last
      continue
    }

    if (text.startsWith('\\epigraph{', match.index)) {
      const first = parseBracedWithWhitespace(text, match.index + '\\epigraph'.length)
      if (!first) {
        html.push(...renderParagraphChunk(text.slice(match.index, match.index + '\\epigraph'.length)))
        last = match.index + '\\epigraph'.length
        blockStartRegex.lastIndex = last
        continue
      }

      const second = parseBracedWithWhitespace(text, first.end)
      if (!second) {
        html.push(...renderParagraphChunk(text.slice(match.index, first.end)))
        last = first.end
        blockStartRegex.lastIndex = last
        continue
      }

      const quoteHtml = parseInline(first.content.trim())
      const authorHtml = parseInline(second.content.trim())
      html.push(`<blockquote><p>${quoteHtml}</p><footer>${authorHtml}</footer></blockquote>`)

      last = second.end
      blockStartRegex.lastIndex = last
      continue
    }

    last = match.index + match[0].length
  }

  if (last < text.length) {
    html.push(...renderParagraphChunk(text.slice(last)))
  }

  return html
}

function findEnvironment(text: string, beginIndex: number, envName: BlockEnvironment): null | {
  innerStart: number
  innerEnd: number
  end: number
} {
  const beginToken = `\\begin{${envName}}`
  const endToken = `\\end{${envName}}`

  let depth = 1
  let cursor = beginIndex + beginToken.length

  // Support nested same-name environments by tracking depth.
  while (cursor <= text.length) {
    const nextBegin = text.indexOf(beginToken, cursor)
    const nextEnd = text.indexOf(endToken, cursor)

    if (nextEnd === -1) {
      return null
    }

    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth += 1
      cursor = nextBegin + beginToken.length
      continue
    }

    depth -= 1
    if (depth === 0) {
      return {
        innerStart: beginIndex + beginToken.length,
        innerEnd: nextEnd,
        end: nextEnd + endToken.length,
      }
    }

    cursor = nextEnd + endToken.length
  }

  return null
}

function renderParagraphChunk(chunk: string): string[] {
  const out: string[] = []
  const separator = /\n\s*\n/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = separator.exec(chunk)) !== null) {
    pushParagraph(out, chunk.slice(cursor, match.index))
    cursor = match.index + match[0].length
  }

  pushParagraph(out, chunk.slice(cursor))
  return out
}

// This renderer uses a blank line as a paragraph separator.
function pushParagraph(output: string[], paragraphRaw: string): void {
  const leadingWhitespace = paragraphRaw.match(/^\s*/)?.[0].length ?? 0
  const trailingWhitespace = paragraphRaw.match(/\s*$/)?.[0].length ?? 0

  const trimmed = paragraphRaw.slice(leadingWhitespace, paragraphRaw.length - trailingWhitespace)
  if (!trimmed) {
    return
  }

  const normalized = trimmed.replace(/\n/g, ' ')
  const inline = parseInline(normalized)
  if (inline.trim()) {
    output.push(`<p>${inline}</p>`)
  }
}

function renderList(kind: 'itemize' | 'enumerate', content: string): string {
  const itemRegex = /\\item\b/g
  const itemStarts: number[] = []
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(content)) !== null) {
    itemStarts.push(match.index)
  }

  if (itemStarts.length === 0) {
    return ''
  }

  const items: string[] = []
  for (let i = 0; i < itemStarts.length; i += 1) {
    const start = itemStarts[i] + '\\item'.length
    const end = i + 1 < itemStarts.length ? itemStarts[i + 1] : content.length
    const rawItem = content.slice(start, end)
    const trimmed = rawItem.trim()
    if (!trimmed) {
      continue
    }

    const normalized = trimmed.replace(/\n/g, ' ')
    const itemHtml = parseInline(normalized)
    items.push(`<li>${itemHtml}</li>`)
  }

  const tag = kind === 'enumerate' ? 'ol' : 'ul'
  return `<${tag}>${items.join('')}</${tag}>`
}

/**
 * Render a simple HTML table from tabular rows/cells.
 * Handles \multicolumn and \multirow, including carry-over row spans.
 */
function renderTabular(spec: string, content: string): string {
  const rows = splitTopLevel(content, '\\\\')
  const htmlRows: string[] = []
  // Column index -> remaining rows covered by an active rowspan.
  const activeRowspans = new Map<number, number>()
  let firstPhysicalRow = true

  for (const rowToken of rows) {
    const row = rowToken.replace(/\\hline/g, '').replace(/\\cline\{[^}]*\}/g, '').trim()
    if (!row) {
      continue
    }

    if (!firstPhysicalRow) {
      decrementRowspanMap(activeRowspans)
    }
    firstPhysicalRow = false

    const cells = splitTopLevel(row, '&')
    let col = 0
    const renderedCells: string[] = []

    for (const rawCell of cells) {
      const cell = parseTableCell(rawCell)
      // Skip synthetic columns occupied by previous rowspans.
      while (activeRowspans.has(col)) {
        col += 1
      }

      let attrs = ''
      if (cell.colspan > 1) {
        attrs += ` colspan="${cell.colspan}"`
      }
      if (cell.rowspan > 1) {
        attrs += ` rowspan="${cell.rowspan}"`
        // Reserve covered columns for upcoming rows.
        for (let step = 0; step < cell.colspan; step += 1) {
          activeRowspans.set(col + step, cell.rowspan - 1)
        }
      }

      renderedCells.push(`<td${attrs}>${cell.html}</td>`)
      col += cell.colspan
    }

    htmlRows.push(`<tr>${renderedCells.join('')}</tr>`)
  }

  const specData = spec ? ` data-spec="${escapeHtml(spec)}"` : ''
  return `<table${specData}><tbody>${htmlRows.join('')}</tbody></table>`
}

function decrementRowspanMap(map: Map<number, number>): void {
  for (const [key, value] of map.entries()) {
    const next = value - 1
    if (next <= 0) {
      map.delete(key)
    } else {
      map.set(key, next)
    }
  }
}

// Peel nested \multicolumn/\multirow wrappers and compute effective spans.
function parseTableCell(rawCell: string): { html: string; colspan: number; rowspan: number } {
  let text = rawCell.trim()
  let colspan = 1
  let rowspan = 1

  let changed = true
  while (changed) {
    changed = false

    const multiColumn = text.match(/^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/)
    if (multiColumn) {
      colspan *= Number.parseInt(multiColumn[1], 10)
      text = multiColumn[2].trim()
      changed = true
    }

    const multiRow = text.match(/^\\multirow\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/)
    if (multiRow) {
      rowspan *= Number.parseInt(multiRow[1], 10)
      text = multiRow[2].trim()
      changed = true
    }
  }

  return {
    html: parseInline(text),
    colspan,
    rowspan,
  }
}

/**
 * Parse inline text commands and preserve raw math delimiters for MathJax.
 * Unknown commands are escaped and emitted as plain text.
 */
function parseInline(text: string): string {
  let output = ''
  let plain = ''
  const escapedDoubleQuote = escapeHtml('"')

  const flushPlain = (): void => {
    if (!plain) {
      return
    }
    output += escapeHtml(applyTypography(plain))
    plain = ''
  }

  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith('$$', i)) {
      const end = findUnescaped(text, '$$', i + 2)
      if (end !== -1) {
        flushPlain()
        const rawMath = text.slice(i, end + 2)
        output += escapeHtml(rawMath)
        i = end + 1
        continue
      }
    }

    if (text[i] === '$') {
      const end = findInlineMathEnd(text, i + 1)
      if (end !== -1) {
        flushPlain()
        const rawMath = text.slice(i, end + 1)
        output += escapeHtml(rawMath)
        i = end
        continue
      }
    }

    if (text[i] === '\\' && text[i + 1] === '\\') {
      flushPlain()
      // TeX line break inside paragraph/list/table cell.
      output += '<br/>'
      i += 1
      continue
    }

    if (text.startsWith('``', i) || text.startsWith("''", i)) {
      flushPlain()
      output += escapedDoubleQuote
      i += 1
      continue
    }

    if (text[i] === '\\') {
      const command = parseInlineCommand(text, i)
      if (command) {
        flushPlain()
        output += command.html
        i = command.end - 1
        continue
      }
    }

    plain += text[i]
  }

  flushPlain()
  return output
}

function parseInlineCommand(text: string, start: number): InlineCommandResult | null {
  let cursor = start + 1
  while (cursor < text.length && /[A-Za-z]/.test(text[cursor])) {
    cursor += 1
  }

  if (cursor === start + 1) {
    return null
  }

  const command = text.slice(start + 1, cursor)

  if (command in STYLE_TAGS) {
    const arg = parseBracedWithWhitespace(text, cursor)
    if (!arg) {
      return { html: escapeHtml(`\\${command}`), end: cursor }
    }

    const parsed = parseInline(arg.content)
    const tag = STYLE_TAGS[command]
    if (command === 'textsc') {
      return { html: `<span>${parsed}</span>`, end: arg.end }
    }

    return { html: `<${tag}>${parsed}</${tag}>`, end: arg.end }
  }

  if (SIZE_COMMANDS.has(command)) {
    const arg = parseBracedWithWhitespace(text, cursor)
    if (!arg) {
      return { html: escapeHtml(`\\${command}`), end: cursor }
    }

    const parsed = parseInline(arg.content)
    return { html: `<span>${parsed}</span>`, end: arg.end }
  }

  if (command === 'url') {
    const arg = parseBracedWithWhitespace(text, cursor)
    if (!arg) {
      return { html: escapeHtml('\\url'), end: cursor }
    }

    const href = sanitizeUrl(arg.content.trim())
    const caption = escapeHtml(arg.content.trim())
    return {
      html: `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${caption}</a>`,
      end: arg.end,
    }
  }

  if (command === 'href') {
    const first = parseBracedWithWhitespace(text, cursor)
    if (!first) {
      return { html: escapeHtml('\\href'), end: cursor }
    }

    const second = parseBracedWithWhitespace(text, first.end)
    if (!second) {
      return { html: escapeHtml('\\href'), end: first.end }
    }

    const href = sanitizeUrl(first.content.trim())
    const caption = parseInline(second.content)
    return {
      html: `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${caption}</a>`,
      end: second.end,
    }
  }

  return { html: escapeHtml(`\\${command}`), end: cursor }
}

// Parse a braced argument while allowing optional whitespace before it.
function parseBracedWithWhitespace(text: string, start: number): null | {
  content: string
  start: number
  end: number
  contentStart: number
} {
  let cursor = start
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1
  }

  const braced = parseBraced(text, cursor)
  if (!braced) {
    return null
  }

  return {
    ...braced,
    contentStart: cursor + 1,
  }
}

// Parse a balanced {...} group, honoring escaped braces.
function parseBraced(text: string, start: number): null | {
  content: string
  start: number
  end: number
} {
  if (text[start] !== '{') {
    return null
  }

  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{' && text[i - 1] !== '\\') {
      depth += 1
    } else if (text[i] === '}' && text[i - 1] !== '\\') {
      depth -= 1
      if (depth === 0) {
        return {
          content: text.slice(start + 1, i),
          start,
          end: i + 1,
        }
      }
    }
  }

  return null
}

/**
 * Split by delimiter only at brace-depth zero.
 * Used for tabular row (`\\`) and cell (`&`) splitting.
 */
function splitTopLevel(text: string, delimiter: '&' | '\\\\'): string[] {
  const out: string[] = []
  let current = ''
  let depth = 0

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (char === '{' && text[i - 1] !== '\\') {
      depth += 1
    } else if (char === '}' && text[i - 1] !== '\\' && depth > 0) {
      depth -= 1
    }

    if (depth === 0 && delimiter === '&' && char === '&') {
      out.push(current)
      current = ''
      continue
    }

    if (depth === 0 && delimiter === '\\\\' && char === '\\' && text[i + 1] === '\\') {
      out.push(current)
      current = ''
      i += 1
      continue
    }

    current += char
  }

  if (current.trim()) {
    out.push(current)
  }

  return out
}

function findUnescaped(text: string, marker: '$$' | '$', start: number): number {
  for (let i = start; i <= text.length - marker.length; i += 1) {
    if (text[i] === '\\') {
      i += 1
      continue
    }

    if (text.startsWith(marker, i)) {
      return i
    }
  }

  return -1
}

function findInlineMathEnd(text: string, start: number): number {
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1
      continue
    }

    if (text[i] === '$' && text[i + 1] !== '$') {
      return i
    }
  }

  return -1
}

// TeX-specific typography token replacements.
function applyTypography(value: string): string {
  return value
    .replace(/<<([\s\S]*?)>>/g, '«$1»')
    .replace(/`(.)'/g, "'$1'")
    .replace(/~---/g, ' — ')
    .replace(/"---/g, ' — ')
}

/**
 * Lightweight sanitizer: preserve only allowlisted tags/attrs
 * and enforce safe URL protocols.
 */
function sanitizeHtml(html: string): string {
  return html.replace(/<[^>]*>/g, (rawTag) => sanitizeTag(rawTag))
}

function sanitizeTag(rawTag: string): string {
  const match = rawTag.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>$/)
  if (!match) {
    return ''
  }

  const isClosing = match[1] === '/'
  const tag = match[2].toLowerCase()
  const attrText = match[3] ?? ''

  if (!ALLOWED_TAGS.has(tag)) {
    return ''
  }

  if (isClosing) {
    return `</${tag}>`
  }

  if (tag === 'br') {
    return '<br/>'
  }

  const attrs = parseAttributes(attrText)
  const allowedAttrs = ALLOWED_ATTRS_BY_TAG[tag] ?? new Set<string>()
  const sanitizedAttrs: Array<[string, string]> = []

  for (const [name, value] of attrs) {
    if (!allowedAttrs.has(name)) {
      continue
    }

    if (tag === 'a' && name === 'href') {
      const safeHref = sanitizeUrl(value)
      if (!safeHref) {
        continue
      }
      sanitizedAttrs.push(['href', safeHref])
      continue
    }

    if (tag === 'a' && name === 'target') {
      if (value === '_blank') {
        sanitizedAttrs.push(['target', '_blank'])
      }
      continue
    }

    if (tag === 'a' && name === 'rel') {
      // rel is managed centrally below when target=_blank is present.
      continue
    }

    if (tag === 'td' && (name === 'colspan' || name === 'rowspan')) {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        sanitizedAttrs.push([name, String(parsed)])
      }
      continue
    }
  }

  if (tag === 'a' && sanitizedAttrs.some(([name, value]) => name === 'target' && value === '_blank')) {
    sanitizedAttrs.push(['rel', 'noopener noreferrer'])
  }

  const attrsString = sanitizedAttrs
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('')

  return `<${tag}${attrsString}>`
}

function parseAttributes(attributeText: string): Array<[string, string]> {
  const attributes: Array<[string, string]> = []
  const regex = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

  let match: RegExpExecArray | null
  while ((match = regex.exec(attributeText)) !== null) {
    const rawName = match[1]
    const name = rawName.toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attributes.push([name, value])
  }

  return attributes
}

function sanitizeUrl(url: string): string {
  const trimmed = String(url ?? '').trim()
  if (!trimmed) {
    return ''
  }

  const isAllowedProtocol = /^(https?:\/\/|mailto:|#)/i.test(trimmed)
  const isSafeRelativePath = /^\/(?!\/)/.test(trimmed)

  return isAllowedProtocol || isSafeRelativePath ? trimmed : ''
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Debounced global typeset trigger. It runs once per animation frame
 * regardless of how many render calls happen in that frame.
 */
function scheduleGlobalMathTypeset(targets?: Element[]): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  if (targets && targets.length > 0) {
    const uniqueTargets = new Set(pendingMathJaxTargets ?? [])
    for (const target of targets) {
      uniqueTargets.add(target)
    }
    pendingMathJaxTargets = [...uniqueTargets]
  } else {
    pendingMathJaxGlobalTypeset = true
    pendingMathJaxTargets = null
  }

  if (mathJaxTypesetScheduled) {
    return
  }
  mathJaxTypesetScheduled = true

  const runTypeset = async (): Promise<void> => {
    mathJaxTypesetScheduled = false
    const mathJax = await ensureMathJax()
    const scopedTargets = selectTypesetTargetsForRun()
    if (!mathJax?.typesetPromise) {
      return
    }

    try {
      if (mathJax.typesetClear) {
        // Avoid stale state from previous typesets.
        mathJax.typesetClear(scopedTargets)
      }
      await mathJax.typesetPromise(scopedTargets)
    } catch {
      // Keep rendering non-blocking if MathJax fails to typeset.
    }
  }

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      void runTypeset()
    })
    return
  }

  setTimeout(() => {
    void runTypeset()
  }, 0)
}

function selectTypesetTargetsForRun(): Element[] | undefined {
  if (pendingMathJaxGlobalTypeset) {
    pendingMathJaxGlobalTypeset = false
    pendingMathJaxTargets = null
    return undefined
  }

  const scopedTargets = pendingMathJaxTargets ?? undefined
  pendingMathJaxTargets = null
  return scopedTargets
}

function findExistingMathJaxScript(): HTMLScriptElement | null {
  const selectors = [
    'script[data-mathjax="tex-renderer"]',
    'script#MathJax-script',
    'script[src*="mathjax"][src*="tex-mml-chtml"]',
    'script[src*="MathJax.js"]',
  ]

  for (const selector of selectors) {
    const candidate = document.querySelector(selector)
    if (candidate instanceof HTMLScriptElement) {
      return candidate
    }
  }

  return null
}

/**
 * Ensure MathJax v3 is loaded exactly once in browser environments.
 * Returns null when unavailable/failing to keep rendering resilient.
 */
function ensureMathJax(): Promise<MathJaxLike | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null)
  }

  if (window.MathJax?.typesetPromise) {
    return Promise.resolve(window.MathJax)
  }

  if (mathJaxLoadPromise) {
    return mathJaxLoadPromise
  }

  window.MathJax = window.MathJax || {
    tex: {
      inlineMath: [['$', '$']],
      displayMath: [['$$', '$$']],
      processEscapes: true,
    },
    svg: {
      fontCache: 'global',
    },
  }

  mathJaxLoadPromise = new Promise<MathJaxLike | null>((resolve, reject) => {
    const existing = findExistingMathJaxScript()
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const clearPendingTimeout = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const settle = (callback: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      clearPendingTimeout()
      callback()
    }

    const fail = (): void => {
      settle(() => reject(new Error('Failed to load MathJax script')))
    }

    const succeed = (): void => {
      settle(() => resolve(window.MathJax ?? null))
    }

    timeoutId = setTimeout(() => {
      fail()
    }, MATHJAX_LOAD_TIMEOUT_MS)

    if (existing) {
      if (window.MathJax?.typesetPromise) {
        succeed()
        return
      }
      existing.addEventListener('load', succeed, { once: true })
      existing.addEventListener('error', fail, { once: true })
      // Existing scripts can already be loaded before listeners are attached.
      setTimeout(() => {
        if (window.MathJax?.typesetPromise) {
          succeed()
        }
      }, 0)
      return
    }

    const script = document.createElement('script')
    script.id = 'MathJax-script'
    script.src = MATHJAX_SCRIPT_URL
    script.async = true
    script.crossOrigin = 'anonymous'
    if (MATHJAX_SCRIPT_INTEGRITY) {
      script.integrity = MATHJAX_SCRIPT_INTEGRITY
    }
    script.dataset.mathjax = 'tex-renderer'
    script.addEventListener('load', succeed, { once: true })
    script.addEventListener('error', fail, { once: true })
    document.head.append(script)
  }).catch(() => {
    mathJaxLoadPromise = null
    return null
  })

  return mathJaxLoadPromise
}
