import type {
  AiSuggestionTab,
  AssetType,
  RecommendedWalletProvider,
} from 'dindin-models';

// Tipos compartilhados entre web e api serão adicionados aqui.

export interface HealthResponse {
  status: string;
  project: string;
}

/** Payload para criação/edição de um provento */
export interface DividendCreateRequest {
  ticker: string;
  assetType?: AssetType;
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

/** Estado da assinatura do usuário (issue #147). */
export type SubscriptionStatus =
  'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

/**
 * Recursos liberados mediante assinatura. `ai` cobre sugestão, chat e futuras
 * features de IA; `projections` cobre a projeção completa por ativo e a agenda
 * de pagamentos (#262).
 */
export type Entitlement = 'ai' | 'projections';

export type SubscriptionPlan = 'basic';
export type SubscriptionInterval = 'month' | 'year';
export type SubscriptionProvider = 'stripe' | 'manual';

/**
 * Último estado da assinatura Stripe recebido pelo webhook (#171). Fica guardado
 * mesmo durante uma concessão manual e vale quando ela termina.
 */
export interface StripeSubscriptionState {
  status: SubscriptionStatus;
  interval: SubscriptionInterval | null;
  providerSubscriptionId?: string;
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
}

/** Documento `users/{uid}/billing/subscription`. Ausência equivale a `status: 'none'`. */
export interface UserSubscription {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  interval: SubscriptionInterval | null;
  provider: SubscriptionProvider | null;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  /** `event.created` (unix seconds) do último evento do provedor aplicado — protege contra webhooks fora de ordem. */
  providerEventCreated?: number;
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
  /** Ausente em docs anteriores à #171. */
  stripe?: StripeSubscriptionState;
}

/** Visão pública da assinatura devolvida em `GET /api/me` (sem ids do provedor). */
export type PublicSubscription = Pick<
  UserSubscription,
  'status' | 'plan' | 'interval' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'
>;

/** Recurso padrão que `POST /api/me/setup` pode criar (#275). */
export type DefaultResource = 'wallet' | 'fridge';

/** Corpo opcional de `POST /api/me/setup`: pedido explícito pelo fallback. */
export interface SetupRequest {
  resource?: DefaultResource;
}

/** Resposta de `POST /api/me/setup`: o que foi criado nesta chamada. */
export interface SetupResponse {
  walletCreated: boolean;
  fridgeCreated: boolean;
}

export interface MeResponse {
  uid: string;
  admin: boolean;
  subscription: PublicSubscription;
  entitlements: Entitlement[];
}

/**
 * Visão da assinatura na área admin: pública + provedor (issue #150) + status
 * da Stripe guardada, para indicar assinatura por baixo da concessão manual (#171).
 */
export type AdminSubscriptionView = PublicSubscription &
  Pick<UserSubscription, 'provider'> & {
    stripeStatus: SubscriptionStatus | null;
  };

/** Usuário listado em `GET /api/admin/users`. */
export interface AdminUser {
  uid: string;
  email: string | null;
  admin: boolean;
  subscription: AdminSubscriptionView;
  entitlements: Entitlement[];
}

/** Body de `PUT /api/admin/users/:uid/subscription`. `null` = sem validade. */
export interface GrantSubscriptionRequest {
  plan: SubscriptionPlan;
  currentPeriodEnd: string | null;
}

// ---------------------------------------------------------------------------
// Contratos de carteira, posição, geladeira e proventos (issue #313)
//
// Viviam redeclarados à mão nos serviços do frontend, enquanto a API mantinha
// interfaces próprias para as mesmas respostas. Um campo renomeado de um lado
// só aparecia em produção; agora a divergência quebra a compilação.
// ---------------------------------------------------------------------------

/** Corpo de criação de carteira. */
export interface CreateWalletRequest {
  name: string;
  currency: string; // BRL-only por decisão de produto (#266)
  description?: string;
}

export type UpdateWalletRequest = Partial<CreateWalletRequest>;

/** Corpo de criação de posição. */
export interface CreatePositionRequest {
  ticker: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
  inFridge?: boolean;
  targetPrice?: number;
}

/** Na atualização, `targetPrice: null` remove o preço-alvo gravado. */
export type UpdatePositionRequest = Partial<
  Omit<CreatePositionRequest, 'targetPrice'>
> & {
  targetPrice?: number | null;
};

export interface MoveToFridgeRequest {
  fridgeId: string;
  targetPrice: number;
}

export interface CreateFridgeRequest {
  name: string;
  description?: string;
}

export type UpdateFridgeRequest = Partial<CreateFridgeRequest>;

export interface CreateFridgeItemRequest {
  ticker: string;
  quantity: number;
  transferredPrice: number;
  targetPrice: number;
}

export type UpdateFridgeItemRequest = Partial<CreateFridgeItemRequest>;

export interface UnfreezeItemRequest {
  walletId: string;
}

export interface ApplySuggestionItemRequest {
  ticker: string;
  fallbackFor?: string;
  quantity: number;
  price: number;
}

/** Projeção de renda de um ativo, pelo último provento informado (#290). */
export interface MonthlyIncomeItem {
  ticker: string;
  quantity: number;
  monthlyDividend: number;
  monthlyIncome: number;
  paymentDate?: string; // YYYY-MM-DD
}

/** Totais da agenda, calculados sobre todos os ativos da carteira. */
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
  /** Ativos das datas de pagamento liberadas; ausente quando não há recorte. */
  scheduleItems?: MonthlyIncomeItem[];
  scheduleTotals?: ScheduleTotals;
  /** Tickers omitidos em `byTicker` pelo recorte gratuito. */
  hiddenTickers?: string[];
  /** Datas de pagamento omitidas na agenda pelo recorte gratuito. */
  hiddenPaymentDates?: string[];
  /** Tickers sem data anunciada omitidos da agenda pelo recorte gratuito. */
  hiddenScheduleTickers?: string[];
}

export interface TickerDividendYield {
  ticker: string;
  annualIncome: number;
  currentValue: number;
  yield: number;
}

export interface DividendYieldResponse {
  byTicker: TickerDividendYield[];
  total: {
    annualIncome: number;
    currentValue: number;
    yield: number;
  };
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
 * Resumo do dashboard (issue #300). Antes a tela montava esses números com
 * uma requisição por carteira e uma por geladeira, e ainda reaplicava regra
 * de negócio no cliente.
 */
export interface DashboardSummaryResponse {
  totalWallet: number;
  totalFridge: number;
  total: number;
  /** Renda mensal projetada, já com a geladeira contada uma única vez. */
  monthlyIncomeTotal: number;
  /** Composição consolidada por ticker, em ordem decrescente de valor. */
  composition: TickerValue[];
}

// ---------------------------------------------------------------------------
// Simulação de proventos (issues #395 e #396)
//
// O resultado da simulação é contrato de tela: a projeção, o troco e a
// premissa saem do motor da API e são exibidos sem recálculo no cliente.
// ---------------------------------------------------------------------------

/** Proventos reinvestidos em novas cotas ou sacados. */
export type SimulationMode = 'reinvest' | 'withdraw';

/**
 * Premissa da projeção, explícita no resultado: parte do **último provento
 * real** e assume que ele se repete. Não vale para pagador trimestral nem
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

/** Recurso de assinante (`projections`); ver `AssetSimulationRequest`. */
export interface AssetSimulationResponse extends SimulationResult {
  ticker: string;
}

export interface WalletSimulationResponse extends SimulationResult {
  provider: Omit<SimulationWalletOption, 'months'>;
  walletMonth: string;
  tab: AiSuggestionTab;
}
