// Tipos compartilhados entre web e api serão adicionados aqui.

export interface HealthResponse {
  status: string;
  project: string;
}

// ---------------------------------------------------------------------------
// Modelo de dados Firestore – issue #7
// Estrutura de coleções:
//   users/{userId}
//   users/{userId}/wallets/{walletId}
//   users/{userId}/wallets/{walletId}/positions/{positionId}
//   users/{userId}/fridges/{fridgeId}
//   users/{userId}/fridges/{fridgeId}/fridgeItems/{itemId}
// ---------------------------------------------------------------------------

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
export type AssetType = "FII" | "STOCK" | "ETF" | "REIT" | "OTHER";

/** Posição de um ativo na carteira — subcoleção `positions` */
export interface Position {
  id: string;
  walletId: string; // wallets/{walletId}
  ticker: string; // ex: "HGLG11"
  assetType: AssetType;
  quantity: number;
  averagePrice: number; // preço médio de compra (BRL)
  currentPrice?: number; // último preço conhecido
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
  assetType: AssetType;
  targetPrice?: number; // preço-alvo para compra
  currentPrice?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
