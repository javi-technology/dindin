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

/** Tipos de ativo suportados em uma posição */
export type AssetType = 'FII' | 'STOCK' | 'ETF' | 'REIT' | 'OTHER';

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
  updatedAt: string; // ISO-8601
  source: string; // ex: "brapi"
}

/** Registro histórico de cotação — subcoleção `quotes/{ticker}/history` */
export interface QuoteHistory {
  date: string; // YYYY-MM-DD
  price: number;
  monthlyDividend: number;
  source: string;
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
