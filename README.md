# tex-html-parser

TypeScript parser/transformer that converts TeX into sanitized HTML.

## What changed

- Package name is now scoped: `@newtonschool/tex-html-parser`.
- Publish behavior changed: `prepublishOnly` now runs only `npm run build`.
- Install and import examples have been updated to use the scoped package name.

## Install

```bash
npm install @newtonschool/tex-html-parser
```

## API

```ts
import { renderTexStatement } from '@newtonschool/tex-html-parser'

const html = renderTexStatement(tex)
```

- Input: `tex: string`
- Output: `string` (sanitized HTML)
- `renderTexStatement` is side-effect free by default.

To opt into MathJax rendering in browsers:

```ts
const html = renderTexStatement(tex, { typeset: true })
```

To scope MathJax work to a specific container:

```ts
const html = renderTexStatement(tex, {
  typeset: true,
  typesetTarget: containerElement,
})
```

MathJax loader security notes:

- The package injects a pinned MathJax CDN URL (`jsDelivr`) at runtime.
- Script loading uses `crossorigin="anonymous"` with timeout fallback.
- You can set a strict CSP to restrict script sources, or provide `window.MathJax` before calling `renderTexStatement` to avoid dynamic script injection.

## React Usage (`dangerouslySetInnerHTML`)

```tsx
import { renderTexStatement } from '@newtonschool/tex-html-parser'

function Statement({ tex }: { tex: string }) {
  const html = renderTexStatement(tex)
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
```

## Supported TeX Subset

- Paragraph splitting by blank line
- Inline/display math delimiters: `$...$`, `$$...$$` (preserved)
- Styles: `\bf`, `\textbf`, `\it`, `\textit`, `\t`, `\tt`, `\texttt`, `\emph`, `\underline`, `\sout`, `\textsc`
- Sizes: `\tiny`, `\scriptsize`, `\small`, `\normalsize`, `\large`, `\Large`, `\LARGE`, `\huge`, `\Huge`
- Environments: `itemize`, `enumerate`, `lstlisting`, `center`, `tabular`
- Table helpers: `\hline`, `\cline`, `\multicolumn`, `\multirow`
- Links: `\url`, `\href`
- `\epigraph`
- Typography replacements for TeX quote/dash tokens

## Not Supported (Dropped)

- `defs.toml` custom command expansion
- `\includegraphics`
- `\def \htmlPixelsInCm`
- React preview component export
- CSS export
- warnings/meta return object

Unsupported or malformed input is rendered best-effort with escaped fallback text.

## Test Cases

Use these cases to validate parser behavior when adding or reviewing changes.

1. Paragraph split:
Input: `First paragraph.\n\nSecond paragraph.`
Expected: `<p>First paragraph.</p><p>Second paragraph.</p>`

2. Math preservation:
Input: `Inline $a+b$ and display $$x^2$$`
Expected: Math delimiters are preserved in output and escaped safely for HTML.

3. Style command mapping:
Input: `\textbf{Bold} \textit{Italic} \underline{Underlined}`
Expected: Uses semantic tags (`<strong>`, `<em>`, `<u>`) in sanitized output.

4. List environments:
Input: `\begin{itemize}\item One \item Two\end{itemize}`
Expected: Ordered/unordered list environments render into `<ul>/<ol>` with `<li>`.

5. Tabular handling:
Input: `\begin{tabular}{|c|c|} A & B \\ \hline C & D \end{tabular}`
Expected: Renders a sanitized HTML table with row/cell structure preserved.

6. Link sanitization:
Input: `\href{javascript:alert(1)}{Click}`
Expected: Unsafe protocols are stripped; only safe URLs (`http`, `https`, `mailto`, `#`, safe relative) are allowed.

7. Malformed/unsupported TeX:
Input: broken or unsupported commands
Expected: Best-effort rendering with escaped fallback text, without unsafe HTML injection.

## Development

```bash
npm test
npm run build
npm run test:package
```

Publish checks:

```bash
npm run prepublishOnly
```

## Contributing

See `CONTRIBUTING.md` for setup, workflow, test expectations, and pull request guidelines.
