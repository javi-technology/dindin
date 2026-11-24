export interface QuoteResult {
  price: number;
  /**
   * Horário de apuração informado pela fonte, em ISO-8601 (issue #387).
   *
   * Opcional de propósito: quando a fonte não informa, a cotação é gravada
   * sem o campo. Preencher com a hora da nossa consulta faria um dado em
   * cache parecer recém-apurado — exatamente a confusão que o campo existe
   * para desfazer.
   */
  quotedAt?: string;
}

/** Cotação marcada com o provedor que a forneceu, gravado em `source`. */
export interface SourcedQuote extends QuoteResult {
  source: string;
}

/**
 * Fonte de cotações (#598). Os jobs dependem desta interface, e não de um
 * provedor: a Brapi deixou de ser a fonte única, e a próxima troca de fonte
 * não deve exigir refazer os handlers.
 *
 * `fetchQuotes` indexa pelo ticker pedido, omite o ticker sem cotação e só
 * lança quando nenhum ticker retornou dados.
 */
export interface QuoteProvider {
  readonly name: string;
  fetchQuotes(tickers: string[]): Promise<Map<string, QuoteResult>>;
}
