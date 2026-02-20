# tex-html-parser

TypeScript parser/transformer that converts TeX into sanitized HTML.

## Install

```bash
npm install tex-html-parser
```

## API

```ts
import { renderTexStatement } from 'tex-html-parser'

const html = renderTexStatement(tex)
```

- Input: `tex: string`
- Output: `string` (sanitized HTML)

In browser environments, MathJax is auto-loaded and typeset is auto-triggered after render calls, so `$...$` and `$$...$$` are visually formatted without app-level MathJax wiring.

MathJax loader security notes:

- The package injects a pinned MathJax CDN URL (`jsDelivr`) at runtime.
- Script loading uses `crossorigin="anonymous"` with timeout fallback.
- You can set a strict CSP to restrict script sources, or provide `window.MathJax` before calling `renderTexStatement` to avoid dynamic script injection.

## React Usage (`dangerouslySetInnerHTML`)

```tsx
import { renderTexStatement } from 'tex-html-parser'

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
