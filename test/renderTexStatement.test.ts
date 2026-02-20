import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderTexStatement } from '../src/index'

function loadFixture(path: string): string {
  return readFileSync(resolve(path), 'utf8')
}

test('returns a string', () => {
  const html = renderTexStatement('Hello')
  assert.equal(typeof html, 'string')
  assert.equal(html, '<p>Hello</p>')
})

test('snapshot: periodic permutation fixture', () => {
  const tex = loadFixture('test/fixtures/periodic-permutation/statement.tex')
  const expected = loadFixture('test/fixtures/periodic-permutation/expected.html').trim()
  const rendered = renderTexStatement(tex).trim()
  assert.equal(rendered, expected)
})

test('snapshot: symbol subset fixture', () => {
  const tex = loadFixture('test/fixtures/symbol-subset/statement.tex')
  const expected = loadFixture('test/fixtures/symbol-subset/expected.html').trim()
  const rendered = renderTexStatement(tex).trim()
  assert.equal(rendered, expected)
})

test('preserves inline and display math delimiters', () => {
  const html = renderTexStatement('Inline $a_i^2$ and display $$x^2 + y^2$$.')
  assert.match(html, /\$a_i\^2\$/)
  assert.match(html, /\$\$x\^2 \+ y\^2\$\$/)
})

test('renders TeX double quotes in plain text', () => {
  const html = renderTexStatement("Print ``-1'' if impossible.")
  assert.match(html, /Print &quot;-1&quot; if impossible\./)
})

test('renders TeX double quotes around inline code command', () => {
  const html = renderTexStatement("Use ``\\texttt{sum_ab(a,b)}''.")
  assert.match(html, /Use &quot;<code>sum_ab\(a,b\)<\/code>&quot;\./)
})

test('renders TeX double quotes around inline code command with punctuation', () => {
  const html = renderTexStatement("Implement ``\\texttt{sum_ab(a: int, b: int) -> int}''.")
  assert.match(html, /Implement &quot;<code>sum_ab\(a: int, b: int\) -&gt; int<\/code>&quot;\./)
})

test('renders lists and table cells with spans', () => {
  const html = renderTexStatement(`\n\\begin{itemize}\n\\item alpha\n\\item beta\n\\end{itemize}\n\n\\begin{tabular}{|c|c|c|}\n\\multicolumn{2}{|c|}{\\multirow{2}{*}{Cell}} & R \\\\ \\cline{3-3}\n\\multicolumn{2}{|c|}{} & B \\\\ \\hline\n\\end{tabular}\n`)

  assert.match(html, /<ul><li>alpha<\/li><li>beta<\/li><\/ul>/)
  assert.match(html, /<table[^>]*>/)
  assert.match(html, /colspan="2"/)
  assert.match(html, /rowspan="2"/)
})

test('renders url and href links with safe attributes', () => {
  const html = renderTexStatement('See \\url{https://codeforces.com/} and \\href{https://example.com}{Example}.')
  assert.match(html, /href="https:\/\/codeforces.com\/"/)
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
})

test('blocks protocol-relative links in href/url commands', () => {
  const html = renderTexStatement('Unsafe \\href{//evil.com}{bad} and \\url{//evil.com}.')

  assert.doesNotMatch(html, /href="\/\/evil\.com"/)
  assert.match(html, /<a[^>]*>bad<\/a>/)
})

test('keeps parser output stable when typesetting is opt-in', () => {
  const html = renderTexStatement('Inline $a+b$', { typeset: true })
  assert.equal(html, '<p>Inline $a+b$</p>')
})

test('falls back safely for unsupported commands', () => {
  const html = renderTexStatement('Alpha \\unknown{test} omega.')
  assert.match(html, /Alpha \\unknown\{test\} omega\./)
})

test('handles malformed environments without crashing', () => {
  const html = renderTexStatement('Before \\begin{itemize} \\item only one item')
  assert.match(html, /Before/)
  assert.match(html, /\\begin\{itemize\}/)
})

test('sanitizes unsafe tags, attrs, and protocols', () => {
  const html = renderTexStatement('x <script>alert(1)</script> y \\href{javascript:alert(1)}{bad}')

  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /javascript:/i)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /<a[^>]*>bad<\/a>/)
})
