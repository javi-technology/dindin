import type { AiSuggestionTab, RecommendedWalletAsset } from 'dindin-models';
import type {
  SimulationMode,
  SimulationWalletOption,
  WalletSimulationResponse,
} from 'dindin-shared-types';
import { getQuotesByTicker } from '../quotes/quote-prices';
import { HttpError } from '../shared/http-error';
import {
  getRecommendedWallet,
  listRecommendedWallets,
} from '../recommended-wallet/recommended-wallet.service';
import {
  DEFAULT_RECOMMENDED_WALLET_SLUG,
  RECOMMENDED_WALLET_PROVIDERS,
  findRecommendedWalletProvider,
} from '../recommended-wallet/providers';
import { SimulationAsset, simulateDividendIncome } from './dividend-simulation';

/**
 * Simulação sobre a carteira sugerida (issue #396).
 *
 * Junta o que o motor precisa — peso, preço e último provento de cada ativo —
 * e nada mais: a conta em si mora em `dividend-simulation`, sem Firestore.
 * A rota é gratuita, então aqui não há consulta de assinatura nem recorte de
 * resultado.
 */

export interface WalletSimulationParams {
  amount: number;
  months: number;
  mode: SimulationMode;
  provider?: string;
  month?: string;
  tab?: AiSuggestionTab;
}

/**
 * Preço e provento de cada ativo da carteira.
 *
 * Sem cotação, o preço de fechamento publicado na própria carteira sugerida
 * entra no lugar: é mais velho que a cotação, mas deixa o ativo participar da
 * alocação em vez de sumir do resultado. Para o provento não há substituto —
 * o ativo entra marcado como sem provento conhecido.
 */
export async function toSimulationAssets(
  assets: RecommendedWalletAsset[],
): Promise<SimulationAsset[]> {
  const quotes = await getQuotesByTicker(assets.map((asset) => asset.ticker));

  return assets.map((asset) => {
    const quote = quotes.get(asset.ticker.toUpperCase());
    return {
      ticker: asset.ticker,
      weight: asset.weight,
      price: quote?.price ?? asset.closePrice,
      ...(quote?.monthlyDividend === undefined
        ? {}
        : { monthlyDividend: quote.monthlyDividend }),
      ...(quote?.dividendPaymentDate
        ? { dividendPaymentDate: quote.dividendPaymentDate }
        : {}),
    };
  });
}

export async function simulateRecommendedWallet(
  params: WalletSimulationParams,
): Promise<WalletSimulationResponse> {
  const slug = params.provider ?? DEFAULT_RECOMMENDED_WALLET_SLUG;
  const provider = findRecommendedWalletProvider(slug);
  if (!provider) {
    throw HttpError.notFound('Provedor de carteira sugerida não encontrado');
  }

  const wallet = await getRecommendedWallet(params.month, provider.slug);
  if (!wallet) {
    throw HttpError.notFound('Carteira sugerida não encontrada');
  }

  const tab: AiSuggestionTab = params.tab ?? 'renda';
  const result = simulateDividendIncome({
    assets: await toSimulationAssets(wallet[tab] ?? []),
    amount: params.amount,
    months: params.months,
    mode: params.mode,
  });

  return {
    ...result,
    provider: {
      slug: provider.slug,
      label: provider.label,
      provider: provider.provider,
    },
    walletMonth: wallet.month,
    tab,
  };
}

/** Carteiras sugeridas disponíveis para simulação, por provedor. */
export async function listSimulationProviders(): Promise<
  SimulationWalletOption[]
> {
  return Promise.all(
    RECOMMENDED_WALLET_PROVIDERS.map(async (provider) => ({
      slug: provider.slug,
      label: provider.label,
      provider: provider.provider,
      months: (await listRecommendedWallets(provider.slug)).map(
        (wallet) => wallet.month,
      ),
    })),
  );
}
