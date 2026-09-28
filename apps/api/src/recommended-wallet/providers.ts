import { RecommendedWalletProvider } from 'dindin-models';

/**
 * Catálogo de provedores de carteira sugerida (issue #395).
 *
 * O provedor era parte do caminho da rota (`/api/recommended-wallets/bb-fii/…`)
 * e do model, fixado em `'BB'`. Como está previsto haver mais carteiras
 * sugeridas, cada uma exigiria um bloco de rotas próprio, com a mesma
 * implementação. Aqui o provedor vira dado: o `slug` é o prefixo do id do
 * documento em `recommendedWallets`, e é o que as rotas novas recebem como
 * parâmetro.
 */

export interface RecommendedWalletProviderInfo {
  /** Prefixo do id do documento e valor aceito nas rotas. */
  slug: string;
  /** Rótulo para a tela. */
  label: string;
  provider: RecommendedWalletProvider;
}

export const RECOMMENDED_WALLET_PROVIDERS: RecommendedWalletProviderInfo[] = [
  { slug: 'bb-fii', label: 'Banco do Brasil — FIIs', provider: 'BB' },
];

export const DEFAULT_RECOMMENDED_WALLET_SLUG = 'bb-fii';

export function findRecommendedWalletProvider(
  slug: string,
): RecommendedWalletProviderInfo | undefined {
  return RECOMMENDED_WALLET_PROVIDERS.find(
    (provider) => provider.slug === slug.toLowerCase(),
  );
}
