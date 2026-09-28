import type { AiSuggestionTab, RecommendedWalletAsset } from 'dindin-models';
import type {
  AssetSimulationResponse,
  SimulationMode,
  SimulationWalletOption,
  WalletSimulationResponse,
} from 'dindin-shared-types';
import { assetExists } from '../assets/asset.service';
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
/**
 * Preço de cotação aproveitável, ou `undefined` para cair no fechamento.
 *
 * A Brapi devolve `regularMarketPrice: 0` para ativo sem negócio no dia, e o
 * mapeamento guarda esse zero. Com `??`, só `undefined` caía no fechamento: o
 * zero seguia adiante e o motor descartava da alocação um ativo cuja carteira
 * sugerida traz preço publicado.
 */
function usablePrice(price: number | undefined): number | undefined {
  return typeof price === 'number' && Number.isFinite(price) && price > 0
    ? price
    : undefined;
}

export async function toSimulationAssets(
  assets: RecommendedWalletAsset[],
): Promise<SimulationAsset[]> {
  const quotes = await getQuotesByTicker(assets.map((asset) => asset.ticker));

  return assets.map((asset) => {
    const quote = quotes.get(asset.ticker.toUpperCase());
    return {
      ticker: asset.ticker,
      weight: asset.weight,
      price: usablePrice(quote?.price) ?? asset.closePrice,
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

export interface AssetSimulationParams {
  ticker: string;
  amount: number;
  months: number;
  mode: SimulationMode;
}

/**
 * Simulação de um ativo isolado (issue #397).
 *
 * Recurso de assinante — o gate fica na rota, com `requireEntitlement`, e não
 * aqui: bloquear só na tela deixaria o cálculo acessível a quem chamasse a API
 * direto.
 *
 * O ticker é conferido contra o catálogo antes da cotação, para que "ativo que
 * não existe" e "ativo sem cotação" não cheguem ao usuário como a mesma falha.
 */
export async function simulateAsset(
  params: AssetSimulationParams,
): Promise<AssetSimulationResponse> {
  const ticker = params.ticker.toUpperCase();
  if (!(await assetExists(ticker))) {
    throw HttpError.notFound('Ativo não encontrado no catálogo');
  }

  const quote = (await getQuotesByTicker([ticker])).get(ticker);
  if (!quote?.price) {
    throw HttpError.notFound('Ativo sem cotação para simular');
  }

  const result = simulateDividendIncome({
    assets: [
      {
        ticker,
        price: quote.price,
        ...(quote.monthlyDividend === undefined
          ? {}
          : { monthlyDividend: quote.monthlyDividend }),
        ...(quote.dividendPaymentDate
          ? { dividendPaymentDate: quote.dividendPaymentDate }
          : {}),
      },
    ],
    amount: params.amount,
    months: params.months,
    mode: params.mode,
  });

  return { ...result, ticker };
}
