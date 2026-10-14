import type {
  AiSuggestion,
  AssetSimulationResponse,
  RecommendedWallet,
  SimulationResult,
  SimulationWalletOption,
  WalletSimulationResponse,
} from 'dindin-shared-types';

// ---------------------------------------------------------------------------
// Fixtures que respeitam o contrato (issue #499)
//
// Os testes de controller trocam o serviço por um mock, e uma fixture mínima
// (`{ id: 'x' }`) deixa de ser aceita quando toda resposta é conferida com o
// OpenAPI. Tipar a fixture com o tipo gerado faz o compilador reprovar a que
// perder um campo, antes mesmo de o teste rodar.
// ---------------------------------------------------------------------------

export const simulacaoFixture: SimulationResult = {
  amount: 1000,
  months: 12,
  mode: 'reinvest',
  allocatedAmount: 990,
  unallocatedAmount: 10,
  monthlyIncome: 8,
  totalIncome: 96,
  reinvestedAmount: 96,
  uninvestedIncome: 0,
  byTicker: [],
  missingDividendTickers: [],
  staleDividendTickers: [],
  basis: {
    source: 'monthlyDividend',
    assumesRepetition: true,
    staleAfterDays: 45,
  },
};

export const simulacaoDeCarteiraFixture: WalletSimulationResponse = {
  ...simulacaoFixture,
  provider: { slug: 'bb-fii', label: 'Banco do Brasil — FIIs', provider: 'BB' },
  walletMonth: '2026-09',
  tab: 'renda',
};

export const simulacaoDeAtivoFixture: AssetSimulationResponse = {
  ...simulacaoFixture,
  ticker: 'MXRF11',
};

export const opcaoDeCarteiraFixture: SimulationWalletOption = {
  slug: 'bb-fii',
  label: 'Banco do Brasil — FIIs',
  provider: 'BB',
  months: ['2026-09'],
};

export const carteiraSugeridaFixture: RecommendedWallet = {
  id: 'bb-fii_2026-09',
  provider: 'BB',
  month: '2026-09',
  revision: 2,
  publishedAt: '2026-09-01',
  sourceFile: 'wallets/fii-bb/CartFII_Set26_2.pdf',
  status: 'pending_review',
  renda: [],
  ganho: [],
  parsedAt: '2026-09-02T10:00:00.000Z',
  createdAt: '2026-09-02T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
};

export const sugestaoFixture: AiSuggestion = {
  id: 'suggestion-1',
  walletId: 'wallet-1',
  month: '2026-09',
  tab: 'renda',
  model: 'modelo-de-teste',
  summary: 'Resumo',
  items: [],
  disclaimer: 'Não é recomendação de investimento.',
  createdAt: '2026-09-02T10:00:00.000Z',
};
