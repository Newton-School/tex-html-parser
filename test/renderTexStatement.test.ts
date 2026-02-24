import test from 'node:test'
import assert from 'node:assert/strict'

import { renderTexStatement } from '../src/index'

test('splits paragraphs by blank line', () => {
  const html = renderTexStatement('First paragraph.\n\nSecond paragraph.')
  assert.equal(html, '<p>First paragraph.</p><p>Second paragraph.</p>')
})

test('renders supported inline style commands', () => {
  const html = renderTexStatement('\\textbf{Bold} \\textit{Italic} \\underline{U}')
  assert.equal(html, '<p><strong>Bold</strong> <em>Italic</em> <u>U</u></p>')
})

test('renders itemize as unordered list', () => {
  const tex = '\\begin{itemize}\\item One \\item Two\\end{itemize}'
  const html = renderTexStatement(tex)
  assert.equal(html, '<ul><li>One</li><li>Two</li></ul>')
})

test('renders tabular as a sanitized table', () => {
  const tex = '\\begin{tabular}{|c|c|} A & B \\\\ C & D \\end{tabular}'
  const html = renderTexStatement(tex)
  assert.equal(
    html,
    '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>',
  )
})

test('strips unsafe href protocols', () => {
  const html = renderTexStatement('\\href{javascript:alert(1)}{Click}')
  assert.equal(html, '<p><a target="_blank" rel="noopener noreferrer">Click</a></p>')
})

test('preserves inline and display math delimiters', () => {
  const html = renderTexStatement('Inline $a+b$ and display $$x^2$$')
  assert.equal(html, '<p>Inline $a+b$ and display $$x^2$$</p>')
})
