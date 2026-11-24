import { ActiveAsset } from '../assets/asset.service';

/** Provento em dinheiro de um ativo, já normalizado pelo provedor. */
export interface DividendEvent {
  rate: number;
  paymentDate?: string; // YYYY-MM-DD
  // Data-com: quem tinha o ativo no fim desse dia tem direito ao provento.
  comDate?: string; // YYYY-MM-DD
}

/**
 * Fonte de proventos (#599). O cálculo do último provento, da soma de 12
 * meses e dos anunciados fica em `fetchMonthlyDividends`, e não no provedor:
 * trocar de fonte não pode mudar o que a agenda e o sync recebem.
 *
 * Devolve os eventos por ticker pedido; o ticker sem provento conhecido fica
 * de fora, nunca com lista vazia que pareça "não paga nada".
 */
export interface DividendProvider {
  readonly name: string;
  fetchDividendEvents(
    assets: ActiveAsset[],
  ): Promise<Map<string, DividendEvent[]>>;
}
