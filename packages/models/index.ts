// Models compartilhados entre web e api.
// Estrutura de coleções no Firestore:
//   users/{userId}
//   users/{userId}/wallets/{walletId}
//   users/{userId}/wallets/{walletId}/positions/{positionId}
//   users/{userId}/fridges/{fridgeId}
//   users/{userId}/fridges/{fridgeId}/fridgeItems/{itemId}
//   users/{userId}/dividends/{dividendId}
//   users/{userId}/patrimonySnapshots/{date}
//   assets/{ticker}
//   quotes/{ticker}
//   quotes/{ticker}/history/{date}
//   recommendedWallets/{id}

/** Documento raiz do usuário — coleção `users` */
export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/** Carteira de investimentos — subcoleção `wallets` */
export interface Wallet {
  id: string;
  ownerId: string; // users/{userId}
  name: string;
  description?: string;
  currency: string; // ex: "BRL"
  createdAt: string;
  updatedAt: string;
}

/**
 * Tipos de ativo suportados, em um lugar só (issue #303).
 *
 * A lista vinha repetida em sete arquivos entre api e web — validação de
 * posição, de provento, do catálogo, da sugestão aplicada e o seletor da
 * tela de admin. Incluir um tipo novo exigia lembrar de todos, e o arquivo
 * esquecido passava a recusar o tipo sem erro de compilação.
 */
export const ASSET_TYPES = ['FII', 'STOCK', 'ETF', 'REIT', 'OTHER'] as const;

/** Tipos de ativo suportados em uma posição */
export type AssetType = (typeof ASSET_TYPES)[number];

/** Se o valor é um tipo de ativo suportado. */
export function isAssetType(value: unknown): value is AssetType {
  return (
    typeof value === 'string' &&
    (ASSET_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Ativo do catálogo suportado pelo app — coleção `assets`.
 * Fonte única de verdade sobre quais tickers podem ser cadastrados em
 * posições/itens da geladeira e quais tickers o job de cotações deve
 * consultar na Brapi.
 */
export interface Asset {
  ticker: string; // ex: "HGLG11", também usado como id do documento
  name: string;
  assetType: AssetType;
  active: boolean;
  qualifiedInvestor?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Posição de um ativo na carteira — subcoleção `positions` */
export interface Position {
  id: string;
  walletId: string; // wallets/{walletId}
  ticker: string; // ex: "HGLG11"
  assetType: AssetType;
  quantity: number;
  averagePrice: number; // preço médio de compra (BRL)
  currentPrice?: number; // último preço conhecido
  /** Indica se a posição está na geladeira (acompanhamento para venda). */
  inFridge: boolean;
  /** Preço-alvo para venda quando na geladeira. */
  targetPrice?: number;
  sector?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Geladeira (watchlist de oportunidades) — subcoleção `fridges` */
export interface Fridge {
  id: string;
  ownerId: string; // users/{userId}
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** Item na geladeira — subcoleção `fridgeItems` */
export interface FridgeItem {
  id: string;
  fridgeId: string; // fridges/{fridgeId}
  ticker: string;
  quantity: number;
  transferredPrice: number; // preço de transferência (quando saiu da carteira)
  targetPrice: number; // preço-alvo para voltar à carteira
  currentPrice?: number;
  assetType?: AssetType;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Provento recebido — subcoleção `dividends` */
export interface Dividend {
  id: string;
  userId: string; // users/{userId}
  ticker: string;
  assetType?: AssetType;
  source?: 'manual' | 'auto';
  amountPerShare: number; // valor por cota/ação
  quantity: number;
  totalAmount: number; // amountPerShare * quantity
  paymentDate: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

/** Cotação atual de um ticker — documento principal em `quotes` */
export interface Quote {
  ticker: string;
  price: number;
  monthlyDividend: number; // último provento/rendimento por cota/ação
  dividendPaymentDate?: string; // YYYY-MM-DD — data de pagamento do provento
  annualDividend?: number; // soma dos proventos pagos nos últimos 12 meses
  updatedAt: string; // ISO-8601 — quando *nós* gravamos a cotação
  /**
   * ISO-8601 — quando a cotação foi apurada na fonte (issue #387).
   *
   * Distinto de `updatedAt`: é o que permite saber se o preço é o fechamento
   * consolidado ou o último negócio do pregão contínuo, e separar atraso da
   * fonte de falha nossa. Ausente nas cotações gravadas antes da #387.
   */
  quotedAt?: string;
  source: string; // ex: "brapi"
}

/** Registro histórico de cotação — subcoleção `quotes/{ticker}/history` */
export interface QuoteHistory {
  date: string; // YYYY-MM-DD
  price: number;
  monthlyDividend: number;
  source: string;
}

/**
 * Provento por cota de um mês — subcoleção `quotes/{ticker}/dividendHistory`
 * (id do doc = `YYYY-MM`).
 *
 * Existe separado de `QuoteHistory` porque o preço muda todo dia e o provento
 * não: guardar um documento por mês faz a leitura do histórico de proventos
 * custar ~12 documentos por ticker em vez de ~365.
 */
export interface MonthlyDividendHistory {
  month: string; // YYYY-MM
  date: string; // YYYY-MM-DD — dia do último snapshot que alimentou o mês
  monthlyDividend: number;
  updatedAt: string; // ISO-8601
}

/** Snapshot diário do patrimônio do usuário — subcoleção `patrimonySnapshots` (id do doc = date) */
export interface PatrimonySnapshot {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  totalWallet: number; // soma de quantity * (quote price ?? averagePrice) de todas as posições de todas as carteiras
  totalFridge: number; // soma de quantity * (quote price ?? transferredPrice) de todos os itens de todas as geladeiras
  total: number; // totalWallet + totalFridge
  createdAt: string; // ISO-8601
}

/** Ativo de uma carteira recomendada — subcoleção `recommendedWallets`. */
export interface RecommendedWalletAsset {
  ticker: string;
  segment: string;
  weight: number;
  closePrice: number;
  ifixWeight: number;
  inCatalog: boolean;
}

export type RecommendedWalletStatus = 'pending_review' | 'confirmed';

/** Carteira recomendada publicada pelo Banco do Brasil. */
export interface RecommendedWallet {
  id: string;
  provider: 'BB';
  month: string;
  revision: number;
  publishedAt: string;
  sourceFile: string;
  status: RecommendedWalletStatus;
  renda: RecommendedWalletAsset[];
  ganho: RecommendedWalletAsset[];
  parsedAt: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendedWalletComparisonItem {
  ticker: string;
  recommendedWeight: number | null;
  currentWeight: number | null;
  quantity: number;
  currentValue: number;
  status: 'match' | 'missing' | 'extra';
}

export interface RecommendedWalletComparison {
  recommended: RecommendedWallet;
  items: RecommendedWalletComparisonItem[];
  totalValue: number;
}

export type AiSuggestionTab = 'renda' | 'ganho';

export interface AiSuggestionFallbackAllocation {
  ticker: string;
  amount: number;
  suggestedQuantity?: number;
  referencePrice?: number;
}

export interface AiSuggestionItem {
  ticker: string;
  action: 'buy' | 'hold' | 'reduce';
  priority: number;
  rationale: string;
  suggestedAmount?: number;
  suggestedQuantity?: number;
  referencePrice?: number;
  qualifiedInvestor?: boolean;
  fallbackAllocations?: AiSuggestionFallbackAllocation[];
}

/**
 * Compra da sugestão já lançada na carteira pelo usuário (#276). A alternativa
 * de redistribuição guarda o FII de origem em `fallbackFor`, porque o mesmo
 * ticker pode ser item próprio e alternativa de outro FII.
 */
export interface AiSuggestionAppliedItem {
  ticker: string;
  fallbackFor?: string;
  quantity: number;
  price: number;
  appliedAt: string;
}

/** Sugestão gerada por IA — subcoleção users/{uid}/aiSuggestions. */
export interface AiSuggestion {
  id: string;
  walletId: string;
  month: string;
  tab: AiSuggestionTab;
  model: string;
  summary: string;
  items: AiSuggestionItem[];
  disclaimer: string;
  createdAt: string;
  contribution?: number;
  projectedDividends?: number;
  historyMonths?: string[];
  appliedItems?: AiSuggestionAppliedItem[];
}

/**
 * Alerta de preço-alvo de um item da geladeira — subcoleção
 * `users/{uid}/alerts` (issue #118).
 *
 * O id é determinístico (`{fridgeId}_{ticker}`) porque só existe um alerta
 * por item: enquanto ele estiver `open` o job não cria outro, e por isso o
 * usuário recebe um aviso por vez que o ativo atinge o alvo, não um por dia.
 * O alerta é rearmado (`cleared`) quando o preço volta abaixo do alvo ou o
 * item sai da geladeira.
 */
export interface Alert {
  id: string; // `${fridgeId}_${ticker}`
  fridgeId: string;
  fridgeName: string;
  ticker: string;
  targetPrice: number;
  currentPrice: number;
  status: 'open' | 'cleared';
  createdAt: string; // ISO-8601
  notifiedAt?: string; // ISO-8601 — preenchido pelo envio do e-mail
  clearedAt?: string; // ISO-8601 — quando o alerta foi rearmado
}
