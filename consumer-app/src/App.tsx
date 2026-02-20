import { useEffect, useRef, useState } from 'react'
import { renderTexStatement } from 'tex-html-parser-local'
import './styles.css'

const DEFAULT_STATEMENT = String.raw`\textbf{Periodic Permutation}

Rahul was gifted a $permutation$ $P$ for his birthday.

\textbf{Input}

The first line contains a single integer $T$.

\begin{itemize}
\item The first line contains $N$.
\item The second line contains the permutation.
\end{itemize}

\textbf{Example}

\begin{lstlisting}
Input
3
1
1
2
1 2
\end{lstlisting}
`

export default function App() {
  const [tex, setTex] = useState(DEFAULT_STATEMENT)
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const rendered = renderTexStatement(tex, {
      typeset: true,
      typesetTarget: previewRef.current,
    })
    setHtml(rendered)
  }, [tex])

  return (
    <main className="page">
      <header className="header">
        <h1>TeX Preview Playground</h1>
        <p>Edit TeX on the left and see rendered preview on the right.</p>
      </header>
      <section className="split">
        <article className="panel">
          <h2>TeX Input</h2>
          <textarea
            className="editor"
            value={tex}
            onChange={(event) => setTex(event.target.value)}
            spellCheck={false}
          />
        </article>
        <article className="panel">
          <h2>Preview</h2>
          <div
            ref={previewRef}
            className="preview"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </section>
    </main>
  )
}
