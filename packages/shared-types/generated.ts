/**
 * Arquivo gerado — não edite à mão.
 *
 * A fonte é `openapi/dindin.yaml`; altere lá e rode `npm run contracts:gen`.
 * O CI roda `npm run contracts:check` e reprova o que estiver fora de dia.
 */

import type {
  AiSuggestion,
  AiSuggestionAppliedItem,
  AiSuggestionFallbackAllocation,
  AiSuggestionItem,
  AiSuggestionTab,
  Asset,
  AssetType,
  DevicePlatform,
  Fridge,
  FridgeItem,
  PatrimonySnapshot,
  Position,
  RecommendedWallet,
  RecommendedWalletAsset,
  RecommendedWalletComparison,
  RecommendedWalletComparisonItem,
  RecommendedWalletProvider,
  RecommendedWalletStatus,
  Wallet,
} from 'dindin-models';

// Reexportados para que `dindin-shared-types` entregue o contrato inteiro,
// sem o consumidor precisar saber de qual pacote cada nome vem.
export type {
  AiSuggestion,
  AiSuggestionAppliedItem,
  AiSuggestionFallbackAllocation,
  AiSuggestionItem,
  AiSuggestionTab,
  Asset,
  AssetType,
  DevicePlatform,
  Fridge,
  FridgeItem,
  PatrimonySnapshot,
  Position,
  RecommendedWallet,
  RecommendedWalletAsset,
  RecommendedWalletComparison,
  RecommendedWalletComparisonItem,
  RecommendedWalletProvider,
  RecommendedWalletStatus,
  Wallet,
};

/**
 * Corpo de erro produzido pelo `asyncHandler` a partir do `HttpError`.
 * A mensagem de 4xx é escrita para a tela e vem em pt-BR; a de 5xx não
 * é exposta.
 */
export interface ErrorResponse {
  error: string;
  /** Código de contrato lido pelo frontend, como `SUBSCRIPTION_REQUIRED`. */
  code?: string;
}

export interface HealthResponse {
  status: string;
  project: string;
}

/** Estado da assinatura do usuário (#147). */
export type SubscriptionStatus =
  'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

/**
 * Recursos liberados mediante assinatura. `ai` cobre sugestão, chat e
 * futuras features de IA; `projections` cobre a projeção completa por
 * ativo e a agenda de pagamentos (#262).
 */
export type Entitlement = 'ai' | 'projections';

export type SubscriptionPlan = 'basic';

export type SubscriptionInterval = 'month' | 'year';

export type SubscriptionProvider = 'stripe' | 'manual' | 'apple' | 'google';

/** Último estado da assinatura Stripe recebido pelo webhook (#171). */
export interface StripeSubscriptionState {
  status: SubscriptionStatus;
  interval: SubscriptionInterval | null;
  providerSubscriptionId?: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
}

/**
 * Documento `users/{uid}/billing/subscription`. Ausência equivale a `status: 'none'`.
 */
export interface UserSubscription {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  interval: SubscriptionInterval | null;
  provider: SubscriptionProvider | null;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  /**
   * `event.created` do último evento aplicado — protege contra webhooks fora de ordem.
   */
  providerEventCreated?: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
  /** Ausente em docs anteriores à #171. */
  stripe?: StripeSubscriptionState;
}

/**
 * Compra feita na loja; o backend valida `credential` com a loja antes de conceder o acesso.
 */
export interface StorePurchaseRequest {
  platform: 'apple' | 'google';
  productId: string;
  /** Recibo da App Store ou `purchaseToken` do Google Play. */
  credential: string;
}

/** Visão pública da assinatura em `GET /api/me`, sem ids do provedor. */
export interface PublicSubscription {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  interval: SubscriptionInterval | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface MeResponse {
  uid: string;
  admin: boolean;
  subscription: PublicSubscription;
  entitlements: Entitlement[];
}

/** Recurso padrão que `POST /api/me/setup` pode criar (#275). */
export type DefaultResource = 'wallet' | 'fridge';

/** Corpo opcional: pedido explícito pelo fallback. */
export interface SetupRequest {
  resource?: DefaultResource;
}

/**
 * Token de notificação do aparelho (issue #408). O app o registra a cada
 * abertura; o backend atualiza o existente em vez de duplicar.
 */
export interface RegisterDeviceTokenRequest {
  token: string;
  platform: DevicePlatform;
}

export interface SetupResponse {
  walletCreated: boolean;
  fridgeCreated: boolean;
}

/** Pública + provedor (#150) + status da Stripe guardada (#171). */
export interface AdminSubscriptionView {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  interval: SubscriptionInterval | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: SubscriptionProvider | null;
  stripeStatus: SubscriptionStatus | null;
}

export interface AdminUser {
  uid: string;
  email: string | null;
  admin: boolean;
  subscription: AdminSubscriptionView;
  entitlements: Entitlement[];
}

/** `currentPeriodEnd: null` = sem validade. */
export interface GrantSubscriptionRequest {
  plan: SubscriptionPlan;
  currentPeriodEnd: string | null;
}

export interface CheckoutSessionRequest {
  interval?: SubscriptionInterval;
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface PortalSessionResponse {
  url: string;
}

export interface CreateAssetRequest {
  ticker: string;
  name: string;
  assetType: AssetType;
  active?: boolean;
  qualifiedInvestor?: boolean;
}

export interface UpdateAssetRequest {
  name?: string;
  assetType?: AssetType;
  active?: boolean;
  qualifiedInvestor?: boolean;
}

export interface CreateWalletRequest {
  name: string;
  /** BRL-only por decisão de produto (#266). */
  currency: string;
  description?: string;
}

export interface UpdateWalletRequest {
  name?: string;
  currency?: string;
  description?: string;
}

export interface CreatePositionRequest {
  ticker: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
  inFridge?: boolean;
  targetPrice?: number;
}

/** `targetPrice: null` remove o preço-alvo gravado. */
export interface UpdatePositionRequest {
  ticker?: string;
  assetType?: AssetType;
  quantity?: number;
  averagePrice?: number;
  inFridge?: boolean;
  targetPrice?: number | null;
}

export interface MoveToFridgeRequest {
  fridgeId: string;
  targetPrice: number;
}

export interface CreateFridgeRequest {
  name: string;
  description?: string;
}

export interface UpdateFridgeRequest {
  name?: string;
  description?: string;
}

export interface CreateFridgeItemRequest {
  ticker: string;
  quantity: number;
  transferredPrice: number;
  targetPrice: number;
}

export interface UpdateFridgeItemRequest {
  ticker?: string;
  quantity?: number;
  transferredPrice?: number;
  targetPrice?: number;
}

export interface UnfreezeItemRequest {
  walletId: string;
}

export interface ApplySuggestionItemRequest {
  ticker: string;
  fallbackFor?: string;
  quantity: number;
  price: number;
}

/** Payload para criação/edição de um provento. */
export interface DividendCreateRequest {
  ticker: string;
  assetType?: AssetType;
  amountPerShare: number;
  quantity: number;
  paymentDate: string;
}

/** Representação de um provento já persistido. */
export interface DividendResponse {
  ticker: string;
  assetType?: AssetType;
  amountPerShare: number;
  quantity: number;
  paymentDate: string;
  id: string;
  userId: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

/** Projeção de renda de um ativo, pelo último provento informado (#290). */
export interface MonthlyIncomeItem {
  ticker: string;
  quantity: number;
  monthlyDividend: number;
  monthlyIncome: number;
  paymentDate?: string;
}

/** Totais da agenda, sobre todos os ativos da carteira. */
export interface ScheduleTotals {
  upcomingTotal: number;
  paidTotal: number;
}

export interface MonthlyIncomeResponse {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
  /** Recorte gratuito aplicado pela API (#262). */
  limited?: boolean;
  /** Ativos das datas de pagamento liberadas; ausente sem recorte. */
  scheduleItems?: MonthlyIncomeItem[];
  scheduleTotals?: ScheduleTotals;
  /** Tickers omitidos em `byTicker` pelo recorte gratuito. */
  hiddenTickers?: string[];
  /** Datas de pagamento omitidas na agenda pelo recorte gratuito. */
  hiddenPaymentDates?: string[];
  /** Tickers sem data anunciada omitidos da agenda pelo recorte. */
  hiddenScheduleTickers?: string[];
}

export interface TickerDividendYield {
  ticker: string;
  annualIncome: number;
  currentValue: number;
  yield: number;
}

export interface DividendYieldTotal {
  annualIncome: number;
  currentValue: number;
  yield: number;
}

export interface DividendYieldResponse {
  byTicker: TickerDividendYield[];
  total: DividendYieldTotal;
}

export interface TickerTotal {
  ticker: string;
  total: number;
}

export interface MonthlyDividendReportMonth {
  month: string;
  total: number;
  byTicker: TickerTotal[];
}

export interface MonthlyDividendReport {
  year: number;
  months: MonthlyDividendReportMonth[];
  byTicker: TickerTotal[];
  total: number;
  availableYears: number[];
}

/** Provento mensal de um ticker; `date` é `YYYY-MM`. */
export interface DividendHistoryEntry {
  date: string;
  monthlyDividend: number;
}

export interface DividendHistoryResponse {
  ticker: string;
  history: DividendHistoryEntry[];
}

export interface DividendHistoryBatchResponse {
  byTicker: Record<string, DividendHistoryEntry[]>;
}

/** Valor consolidado de um ticker, para a composição da carteira. */
export interface TickerValue {
  ticker: string;
  value: number;
}

/**
 * Resumo do dashboard (#300). Antes a tela montava esses números com uma
 * requisição por carteira e uma por geladeira, e reaplicava regra de
 * negócio no cliente.
 */
export interface DashboardSummaryResponse {
  totalWallet: number;
  totalFridge: number;
  total: number;
  /** Renda mensal projetada, com a geladeira contada uma única vez. */
  monthlyIncomeTotal: number;
  /** Composição consolidada por ticker, em ordem decrescente de valor. */
  composition: TickerValue[];
}

/** Data do snapshot; o padrão é hoje. */
export interface PatrimonySnapshotRequest {
  date?: string;
}

/** Proventos reinvestidos em novas cotas ou sacados. */
export type SimulationMode = 'reinvest' | 'withdraw';

/**
 * Premissa da projeção, explícita no resultado: parte do último provento
 * real e assume que ele se repete. Não vale para pagador trimestral nem
 * para FII de provento variável, e a tela precisa dizer isso.
 */
export interface SimulationBasis {
  source: 'monthlyDividend';
  assumesRepetition: true;
  staleAfterDays: number;
}

export interface SimulationItem {
  ticker: string;
  price: number;
  monthlyDividend: number;
  /** Cotas compradas com o aporte inicial. */
  quantity: number;
  /** Cotas ao fim do horizonte; difere de `quantity` no reinvestimento. */
  finalQuantity: number;
  investedAmount: number;
  monthlyIncome: number;
  totalIncome: number;
  /** Sem cotação utilizável: ficou fora da alocação. */
  missingPrice?: true;
  /** Sem último provento real conhecido: entrou com renda zero, declarada. */
  missingDividend?: true;
  /** Último provento real além de `basis.staleAfterDays`. */
  staleDividend?: true;
}

export interface SimulationResult {
  amount: number;
  months: number;
  mode: SimulationMode;
  allocatedAmount: number;
  /** Troco do aporte: não comprou cota inteira e não rende. */
  unallocatedAmount: number;
  monthlyIncome: number;
  totalIncome: number;
  reinvestedAmount: number;
  uninvestedIncome: number;
  byTicker: SimulationItem[];
  missingDividendTickers: string[];
  staleDividendTickers: string[];
  basis: SimulationBasis;
}

/** Provedor de carteira sugerida e os meses que ele tem publicados. */
export interface SimulationWalletOption {
  slug: string;
  label: string;
  provider: RecommendedWalletProvider;
  months: string[];
}

/** O provedor no resultado, sem a lista de meses. */
export interface SimulationWalletProvider {
  slug: string;
  label: string;
  provider: RecommendedWalletProvider;
}

export interface WalletSimulationRequest {
  /** Número ou texto em pt-BR (`1.500,55`); a API converte. */
  amount: number | string;
  months: number;
  mode?: SimulationMode;
  /** Provedor da carteira sugerida; o padrão é o primeiro do catálogo. */
  provider?: string;
  /** Mês da carteira; o padrão é a mais recente do provedor. */
  month?: string;
  tab?: AiSuggestionTab;
}

export interface AssetSimulationRequest {
  ticker: string;
  /** Número ou texto em pt-BR (`1.500,55`); a API converte. */
  amount: number | string;
  months: number;
  mode?: SimulationMode;
}

/** Recurso de assinante (`projections`). */
export interface AssetSimulationResponse {
  amount: number;
  months: number;
  mode: SimulationMode;
  allocatedAmount: number;
  /** Troco do aporte: não comprou cota inteira e não rende. */
  unallocatedAmount: number;
  monthlyIncome: number;
  totalIncome: number;
  reinvestedAmount: number;
  uninvestedIncome: number;
  byTicker: SimulationItem[];
  missingDividendTickers: string[];
  staleDividendTickers: string[];
  basis: SimulationBasis;
  ticker: string;
}

export interface WalletSimulationResponse {
  amount: number;
  months: number;
  mode: SimulationMode;
  allocatedAmount: number;
  /** Troco do aporte: não comprou cota inteira e não rende. */
  unallocatedAmount: number;
  monthlyIncome: number;
  totalIncome: number;
  reinvestedAmount: number;
  uninvestedIncome: number;
  byTicker: SimulationItem[];
  missingDividendTickers: string[];
  staleDividendTickers: string[];
  basis: SimulationBasis;
  provider: SimulationWalletProvider;
  walletMonth: string;
  tab: AiSuggestionTab;
}
