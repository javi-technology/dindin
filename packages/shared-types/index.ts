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

/** Estado da assinatura do usuário (issue #147). */
export type SubscriptionStatus =
  'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

/** Recursos liberados mediante assinatura. `ai` cobre sugestão, chat e futuras features de IA. */
export type Entitlement = 'ai';

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
