import type { AssetType } from 'dindin-models';

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
