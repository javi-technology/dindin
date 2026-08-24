// Tipos compartilhados entre web e api serão adicionados aqui.

export interface HealthResponse {
  status: string;
  project: string;
}

/** Tipos de ativo suportados em um provento */
export type DividendAssetType = 'FII' | 'STOCK' | 'ETF' | 'REIT' | 'OTHER';

/** Payload para criação/edição de um provento */
export interface DividendCreateRequest {
  ticker: string;
  assetType?: DividendAssetType;
  amountPerShare: number;
  quantity: number;
  paymentDate: string; // YYYY-MM-DD
}

/** Representação de um provento já persistido */
export interface DividendResponse extends DividendCreateRequest {
  id: string;
  userId: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}
