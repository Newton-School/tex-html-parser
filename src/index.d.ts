export type RenderTexStatementOptions = {
  typeset?: boolean
  typesetTarget?: Element | Element[] | null
}

export declare function renderTexStatement(tex: string, options?: RenderTexStatementOptions): string
