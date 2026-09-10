let firestoreMock: any;
const compareWithWalletMock = jest.fn();
const getRecommendedWalletMock = jest.fn();
const getQuotePricesMock = jest.fn();
const computeMonthlyIncomeMock = jest.fn();
const listQualifiedInvestorTickersMock = jest.fn();

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => firestoreMock),
}));

jest.mock('../../src/recommended-wallet/recommended-wallet.service', () => ({
  compareWithWallet: (...args: unknown[]) => compareWithWalletMock(...args),
  getRecommendedWallet: (...args: unknown[]) =>
    getRecommendedWalletMock(...args),
  getQuotePrices: (...args: unknown[]) => getQuotePricesMock(...args),
}));

jest.mock('../../src/assets/asset.service', () => ({
  listQualifiedInvestorTickers: (...args: unknown[]) =>
    listQualifiedInvestorTickersMock(...args),
}));

jest.mock('../../src/dividend/monthly-income.service', () => ({
  computeMonthlyIncome: (...args: unknown[]) =>
    computeMonthlyIncomeMock(...args),
}));

import {
  buildSuggestionInput,
  callOpenRouter,
  checkDailyLimit,
  generateSuggestion,
  buildSuggestionHistory,
  previousMonths,
  applySuggestedQuantities,
  applyQualifiedInvestor,
  applyFallbackAllocations,
  getSavedSuggestion,
  parseSuggestionOutput,
  suggestionId,
} from '../../src/recommended-wallet/ai-suggestion.service';
import {
  buildUserPrompt,
  SYSTEM_PROMPT,
} from '../../src/recommended-wallet/ai-suggestion.prompt';
import { RecommendedWallet, RecommendedWalletComparison } from 'dindin-models';

describe('ai-suggestion.service', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  const comparison = {
    recommended: {
      id: 'bb-fii_2026-09',
      month: '2026-09',
      renda: [
        {
          ticker: 'HGLG11',
          segment: 'Logísticos',
          weight: 0.2,
          closePrice: 160,
        },
      ],
      ganho: [],
    },
    items: [
      {
        ticker: 'HGLG11',
        recommendedWeight: 0.2,
        currentWeight: 0.1,
        quantity: 2,
        currentValue: 320,
        status: 'match',
      },
      {
        ticker: 'XPML11',
        recommendedWeight: null,
        currentWeight: 0.3,
        quantity: 3,
        currentValue: 300,
        status: 'extra',
      },
    ],
    totalValue: 620,
  } as RecommendedWalletComparison;

  beforeEach(() => {
    jest.clearAllMocks();
    getRecommendedWalletMock.mockResolvedValue(null);
    getQuotePricesMock.mockResolvedValue(new Map());
    listQualifiedInvestorTickersMock.mockResolvedValue(new Set());
    computeMonthlyIncomeMock.mockResolvedValue({
      byTicker: [],
      total: 2.5,
      totalFromFridge: 0,
      monthlyDividendByTicker: new Map([['HGLG11', 1.25]]),
    });
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('deve montar o contexto com tickers, pesos e proventos', () => {
    const input = buildSuggestionInput(
      comparison,
      'renda',
      new Map([['HGLG11', 1.25]]),
      500,
    );

    expect(input).toMatchObject({
      contribution: 500,
      projectedDividends: 2.5,
    });
    expect(input.items).toEqual([
      expect.objectContaining({
        ticker: 'HGLG11',
        segment: 'Logísticos',
        weight: 0.2,
        closePrice: 160,
        monthlyDividend: 1.25,
      }),
      expect.objectContaining({ ticker: 'XPML11', status: 'extra' }),
    ]);
  });

  it('não deve incluir campos undefined em itens sem dados', () => {
    const input = buildSuggestionInput(comparison, 'renda', new Map(), 500);

    const extra = input.items.find((item) => item.ticker === 'XPML11');
    expect(extra).toBeDefined();
    for (const key of ['segment', 'weight', 'closePrice', 'monthlyDividend']) {
      expect(extra).not.toHaveProperty(key);
    }
  });

  it('deve permitir sobrescrever os proventos projetados', () => {
    const input = buildSuggestionInput(
      comparison,
      'renda',
      new Map([['HGLG11', 1.25]]),
      undefined,
      [],
      22,
    );

    expect(input.projectedDividends).toBe(22);
  });

  it('deve calcular quantidades sugeridas usando o preço de referência', () => {
    const items = applySuggestedQuantities(
      [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Comprar.',
          suggestedAmount: 500,
        },
        {
          ticker: 'XPML11',
          action: 'buy',
          priority: 2,
          rationale: 'Comprar.',
          suggestedAmount: 0,
        },
        {
          ticker: 'VISC11',
          action: 'buy',
          priority: 3,
          rationale: 'Comprar.',
          suggestedAmount: 100,
        },
      ],
      new Map([
        ['HGLG11', 160],
        ['VISC11', 0],
      ]),
    );

    expect(items[0]).toEqual(
      expect.objectContaining({
        suggestedQuantity: 3,
        referencePrice: 160,
      }),
    );
    expect(items[1]).not.toHaveProperty('suggestedQuantity');
    expect(items[1]).not.toHaveProperty('referencePrice');
    expect(items[2]).not.toHaveProperty('suggestedQuantity');
    expect(items[2]).not.toHaveProperty('referencePrice');
  });

  it('deve marcar ativos de investidores qualificados no contexto', () => {
    const input = (buildSuggestionInput as any)(
      comparison,
      'renda',
      new Map(),
      undefined,
      [],
      undefined,
      new Set(['HGLG11']),
    );

    expect(input.items[0]).toEqual(
      expect.objectContaining({ ticker: 'HGLG11', qualifiedInvestor: true }),
    );
    expect(input.items[1]).not.toHaveProperty('qualifiedInvestor');
  });

  it('deve aplicar a marca de investidor qualificado à resposta da IA', () => {
    const items = applyQualifiedInvestor(
      [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Compre.',
        },
        {
          ticker: 'XPML11',
          action: 'hold',
          priority: 2,
          rationale: 'Mantenha.',
        },
      ],
      new Set(['HGLG11']),
    );

    expect(items[0]).toEqual(
      expect.objectContaining({ qualifiedInvestor: true }),
    );
    expect(items[1]).not.toHaveProperty('qualifiedInvestor');
  });

  it('deve incluir aporte e total disponível no prompt', () => {
    const input = buildSuggestionInput(
      comparison,
      'renda',
      new Map([['HGLG11', 1.25]]),
      500,
    );

    const prompt = buildUserPrompt(input);

    expect(prompt).toContain('Aporte disponível neste mês: R$ 500');
    expect(prompt).toContain(
      'Proventos mensais projetados da carteira: R$ 2.5',
    );
    expect(prompt).toContain('Total disponível para investir: R$ 502.5');
  });

  it('deve incluir o status de investidor qualificado no prompt', () => {
    const input = (buildSuggestionInput as any)(
      comparison,
      'renda',
      new Map(),
      undefined,
      [],
      undefined,
      new Set(['HGLG11']),
    );

    const prompt = buildUserPrompt(input);

    expect(prompt).toContain('qualifiedInvestor=sim');
    expect(prompt).toContain('qualifiedInvestor=não');
    expect(SYSTEM_PROMPT).toContain(
      'Tickers com qualifiedInvestor=sim são exclusivos para investidor qualificado',
    );
    expect(SYSTEM_PROMPT).toContain('fallbackAllocations');
    expect(SYSTEM_PROMPT).toContain('OPCIONAIS');
  });

  it('deve orientar a IA a continuar comprando de forma proporcional após equalizar os pesos', () => {
    expect(SYSTEM_PROMPT).toContain(
      'Após preencher as lacunas, distribua o saldo restante entre os tickers da carteira recomendada proporcionalmente ao peso recomendado',
    );
    expect(SYSTEM_PROMPT).toContain(
      'Estar no peso recomendado NÃO é motivo para "hold" quando há saldo disponível',
    );
    expect(SYSTEM_PROMPT).toContain(
      'Só deixe saldo sem alocar quando ele for menor que o closePrice de todos os tickers elegíveis',
    );
  });

  it('deve calcular os meses anteriores considerando a virada do ano', () => {
    expect(previousMonths('2026-01')).toEqual([
      '2025-12',
      '2025-11',
      '2025-10',
    ]);
    expect(previousMonths('2026-09', 2)).toEqual(['2026-08', '2026-07']);
  });

  it('deve montar o histórico ordenado para a aba selecionada', () => {
    const wallets = [
      {
        month: '2026-07',
        renda: [{ ticker: 'HGLG11', weight: 0.2, segment: 'Logísticos' }],
        ganho: [],
      },
      {
        month: '2026-08',
        renda: [{ ticker: 'XPML11', weight: 0.15, segment: 'Shoppings' }],
        ganho: [],
      },
    ] as RecommendedWallet[];

    expect(buildSuggestionHistory(wallets, 'renda')).toEqual([
      {
        month: '2026-08',
        assets: [{ ticker: 'XPML11', weight: 0.15, segment: 'Shoppings' }],
      },
      {
        month: '2026-07',
        assets: [{ ticker: 'HGLG11', weight: 0.2, segment: 'Logísticos' }],
      },
    ]);
  });

  it('deve incluir o histórico no prompt ou indicar indisponibilidade', () => {
    const history = [
      {
        month: '2026-08',
        assets: [{ ticker: 'HGLG11', weight: 0.2, segment: 'Logísticos' }],
      },
    ];
    const input = buildSuggestionInput(
      comparison,
      'renda',
      new Map(),
      undefined,
      history,
    );

    const prompt = buildUserPrompt(input);

    expect(prompt).toContain(
      'Histórico da carteira recomendada (meses anteriores):',
    );
    expect(prompt).toContain('- 2026-08: HGLG11 peso=0.2 segmento=Logísticos');
    expect(SYSTEM_PROMPT).toContain(
      'Use o histórico das carteiras recomendadas dos meses anteriores',
    );
    expect(
      buildUserPrompt(buildSuggestionInput(comparison, 'renda', new Map())),
    ).toContain('Histórico da carteira recomendada: indisponível');
  });

  it('deve validar e ordenar a resposta removendo tickers não permitidos', () => {
    const result = parseSuggestionOutput(
      JSON.stringify({
        summary: 'Foque na diversificação.',
        items: [
          {
            ticker: 'XPML11',
            action: 'buy',
            priority: 2,
            rationale: 'Fora da carteira.',
          },
          {
            ticker: 'HGLG11',
            action: 'hold',
            priority: 1,
            rationale: 'Mantenha a posição.',
          },
        ],
        disclaimer: 'Aviso.',
      }),
      new Map([['HGLG11', 'match']]),
    );

    expect(result.items.map((item) => item.ticker)).toEqual(['HGLG11']);
    expect(result.disclaimer).toBe('Aviso.');
  });

  it('deve converter compra de item extra em manutenção', () => {
    const result = parseSuggestionOutput(
      JSON.stringify({
        summary: 'Resumo.',
        items: [
          {
            ticker: 'XPML11',
            action: 'buy',
            priority: 1,
            rationale: 'Compre mais.',
            suggestedAmount: 250,
          },
        ],
      }),
      new Map([['XPML11', 'extra']]),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        ticker: 'XPML11',
        action: 'hold',
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty('suggestedAmount');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[parseSuggestionOutput] compra em item extra convertida',
      { ticker: 'XPML11' },
    );
  });

  it('deve distribuir compras acima do total disponível', () => {
    const result = parseSuggestionOutput(
      JSON.stringify({
        summary: 'Resumo.',
        items: [
          {
            ticker: 'HGLG11',
            action: 'buy',
            priority: 1,
            rationale: 'Aumente a posição.',
            suggestedAmount: 70,
          },
          {
            ticker: 'VISC11',
            action: 'buy',
            priority: 2,
            rationale: 'Aumente a posição.',
            suggestedAmount: 50,
          },
        ],
      }),
      new Map([
        ['HGLG11', 'missing'],
        ['VISC11', 'underweight'],
      ]),
      100,
    );

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ticker: 'HGLG11', suggestedAmount: 58.33 }),
        expect.objectContaining({ ticker: 'VISC11', suggestedAmount: 41.67 }),
      ]),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[parseSuggestionOutput] compras ajustadas ao total disponível',
      {
        amounts: [
          { ticker: 'HGLG11', from: 70, to: 58.33 },
          { ticker: 'VISC11', from: 50, to: 41.67 },
        ],
      },
    );
  });

  it('deve filtrar alocações alternativas inválidas e não permitidas', () => {
    const result = parseSuggestionOutput(
      JSON.stringify({
        summary: 'Resumo.',
        items: [
          {
            ticker: 'HGLG11',
            action: 'buy',
            priority: 1,
            rationale: 'Compre.',
            suggestedAmount: 100,
            fallbackAllocations: [
              { ticker: 'HGCR11', amount: 50 },
              { ticker: 'XPML11', amount: 25 },
              { ticker: 'NAOEXISTE11', amount: 10 },
              { ticker: 'HGLG11', amount: 15 },
            ],
          },
          {
            ticker: 'VISC11',
            action: 'hold',
            priority: 2,
            rationale: 'Mantenha.',
            fallbackAllocations: [{ ticker: 'HGCR11', amount: 10 }],
          },
          {
            ticker: 'XPML11',
            action: 'hold',
            priority: 3,
            rationale: 'Mantenha.',
            fallbackAllocations: [{ ticker: 'HGCR11', amount: 10 }],
          },
        ],
      }),
      new Map([
        ['HGLG11', 'match'],
        ['VISC11', 'match'],
        ['XPML11', 'extra'],
        ['HGCR11', 'missing'],
      ]),
    );

    expect(result.items[0].fallbackAllocations).toEqual([
      { ticker: 'HGCR11', amount: 50 },
    ]);
    expect(result.items[1].fallbackAllocations).toEqual([
      { ticker: 'HGCR11', amount: 10 },
    ]);
    expect(result.items[2].fallbackAllocations).toEqual([
      { ticker: 'HGCR11', amount: 10 },
    ]);
  });

  it('deve remover alocações alternativas vazias ou não-array', () => {
    const result = parseSuggestionOutput(
      JSON.stringify({
        summary: 'Resumo.',
        items: [
          {
            ticker: 'HGLG11',
            action: 'hold',
            priority: 1,
            rationale: 'Mantenha.',
            fallbackAllocations: [
              { ticker: '', amount: 10 },
              { ticker: 'HGCR11', amount: 0 },
            ],
          },
          {
            ticker: 'VISC11',
            action: 'hold',
            priority: 2,
            rationale: 'Mantenha.',
            fallbackAllocations: { ticker: 'HGCR11', amount: 10 },
          },
        ],
      }),
      new Map([
        ['HGLG11', 'match'],
        ['VISC11', 'match'],
        ['HGCR11', 'missing'],
      ]),
    );

    expect(result.items[0]).not.toHaveProperty('fallbackAllocations');
    expect(result.items[1]).not.toHaveProperty('fallbackAllocations');
  });

  it('deve escalar alocações alternativas junto com as compras', () => {
    const result = parseSuggestionOutput(
      JSON.stringify({
        summary: 'Resumo.',
        items: [
          {
            ticker: 'HGLG11',
            action: 'buy',
            priority: 1,
            rationale: 'Compre.',
            suggestedAmount: 70,
            fallbackAllocations: [{ ticker: 'HGCR11', amount: 70 }],
          },
          {
            ticker: 'VISC11',
            action: 'buy',
            priority: 2,
            rationale: 'Compre.',
            suggestedAmount: 50,
            fallbackAllocations: [{ ticker: 'HGCR11', amount: 50 }],
          },
        ],
      }),
      new Map([
        ['HGLG11', 'match'],
        ['VISC11', 'match'],
        ['HGCR11', 'missing'],
      ]),
      100,
    );

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ticker: 'HGLG11',
          suggestedAmount: 58.33,
          fallbackAllocations: [{ ticker: 'HGCR11', amount: 58.33 }],
        }),
        expect.objectContaining({
          ticker: 'VISC11',
          suggestedAmount: 41.67,
          fallbackAllocations: [{ ticker: 'HGCR11', amount: 41.67 }],
        }),
      ]),
    );
  });

  it('deve aplicar alocações alternativas válidas e calcular quantidade', () => {
    const items = applyFallbackAllocations(
      [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Compre.',
          suggestedAmount: 100,
          fallbackAllocations: [{ ticker: 'hgcr11', amount: 100 }],
        },
        {
          ticker: 'HGCR11',
          action: 'hold',
          priority: 2,
          rationale: 'Mantenha.',
          fallbackAllocations: [{ ticker: 'HGLG11', amount: 20 }],
        },
      ],
      new Set(['HGLG11']),
      [
        {
          ticker: 'HGLG11',
          recommendedWeight: 0.125,
          currentWeight: 0.1,
          quantity: 2,
          currentValue: 200,
          status: 'match',
        },
        {
          ticker: 'HGCR11',
          recommendedWeight: 0.1,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
      ],
      new Map([
        ['HGLG11', 100],
        ['HGCR11', 96.44],
      ]),
    );

    expect(items[0].fallbackAllocations).toEqual([
      {
        ticker: 'HGCR11',
        amount: 100,
        referencePrice: 96.44,
        suggestedQuantity: 1,
      },
    ]);
    expect(items[1]).not.toHaveProperty('fallbackAllocations');
  });

  it('deve redistribuir proporcionalmente quando a soma divergir', () => {
    const [item] = applyFallbackAllocations(
      [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Compre.',
          suggestedAmount: 100,
          fallbackAllocations: [
            { ticker: 'HGCR11', amount: 10 },
            { ticker: 'VISC11', amount: 30 },
          ],
        },
      ],
      new Set(['HGLG11']),
      [
        {
          ticker: 'HGLG11',
          recommendedWeight: 0.125,
          currentWeight: 0.1,
          quantity: 2,
          currentValue: 200,
          status: 'match',
        },
        {
          ticker: 'HGCR11',
          recommendedWeight: 0.1,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
        {
          ticker: 'VISC11',
          recommendedWeight: 0.1,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
      ],
      new Map(),
    );

    expect(item.fallbackAllocations).toEqual([
      { ticker: 'HGCR11', amount: 25 },
      { ticker: 'VISC11', amount: 75 },
    ]);
  });

  it('deve gerar fallback determinístico e excluir extras e qualificados', () => {
    const [item] = applyFallbackAllocations(
      [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Compre.',
          suggestedAmount: 100,
        },
      ],
      new Set(['HGLG11', 'VISC11']),
      [
        {
          ticker: 'HGLG11',
          recommendedWeight: 0.125,
          currentWeight: 0.1,
          quantity: 2,
          currentValue: 200,
          status: 'match',
        },
        {
          ticker: 'HGCR11',
          recommendedWeight: 0.125,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
        {
          ticker: 'KNCR11',
          recommendedWeight: 0.125,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
        {
          ticker: 'VISC11',
          recommendedWeight: 0.125,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
        {
          ticker: 'MXRF11',
          recommendedWeight: null,
          currentWeight: 0.2,
          quantity: 2,
          currentValue: 200,
          status: 'extra',
        },
      ],
      new Map(),
    );

    expect(item.fallbackAllocations).toEqual([
      { ticker: 'HGCR11', amount: 50 },
      { ticker: 'KNCR11', amount: 50 },
    ]);
  });

  it('deve dividir igualmente quando os pesos forem zero e remover sem candidatos', () => {
    const items = applyFallbackAllocations(
      [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Compre.',
          suggestedAmount: 100,
        },
      ],
      new Set(['HGLG11']),
      [
        {
          ticker: 'HGLG11',
          recommendedWeight: 0.125,
          currentWeight: 0.1,
          quantity: 2,
          currentValue: 200,
          status: 'match',
        },
        {
          ticker: 'HGCR11',
          recommendedWeight: 0,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
        {
          ticker: 'VISC11',
          recommendedWeight: 0,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
      ],
      new Map(),
    );

    expect(items[0].fallbackAllocations).toEqual([
      { ticker: 'HGCR11', amount: 50 },
      { ticker: 'VISC11', amount: 50 },
    ]);

    const withoutCandidates = applyFallbackAllocations(
      [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Compre.',
          suggestedAmount: 100,
        },
      ],
      new Set(['HGLG11']),
      [
        {
          ticker: 'HGLG11',
          recommendedWeight: 0.125,
          currentWeight: 0.1,
          quantity: 2,
          currentValue: 200,
          status: 'match',
        },
      ],
      new Map(),
    );

    expect(withoutCandidates[0]).not.toHaveProperty('fallbackAllocations');
  });

  it('deve descartar individualmente itens inválidos', () => {
    const result = parseSuggestionOutput(
      JSON.stringify({
        summary: 'Resumo.',
        items: [
          {
            ticker: 'HGLG11',
            action: 'hold',
            priority: 'invalida',
            rationale: 'Item inválido.',
          },
          {
            ticker: 'VISC11',
            action: 'hold',
            priority: 1,
            rationale: 'Item válido.',
          },
        ],
      }),
      new Map([
        ['HGLG11', 'match'],
        ['VISC11', 'match'],
      ]),
    );

    expect(result.items.map((item) => item.ticker)).toEqual(['VISC11']);
  });

  it('deve rejeitar JSON inválido', () => {
    expect(() =>
      parseSuggestionOutput('{invalido', new Map([['HGLG11', 'match']])),
    ).toThrow('Resposta inválida da IA');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[parseSuggestionOutput] resposta inválida',
      { reason: 'JSON inválido', snippet: '{invalido' },
    );
  });

  it('deve aceitar JSON em code fence e campos tolerantes', () => {
    const result = parseSuggestionOutput(
      [
        '```json',
        JSON.stringify({
          summary: 'Resumo.',
          items: [
            {
              ticker: 'HGLG11',
              action: 'hold',
              priority: '2',
              rationale: 'Mantenha.',
              suggestedAmount: null,
            },
          ],
        }),
        '```',
      ].join('\n'),
      new Map([['HGLG11', 'match']]),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        ticker: 'HGLG11',
        priority: 2,
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty('suggestedAmount');
    expect(result.disclaimer).toBe(
      'Este conteúdo não é recomendação de investimento.',
    );
  });

  it('deve usar openai/gpt-5.6-luna quando OPENROUTER_MODEL não está definido', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'modelo-real',
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    });

    await callOpenRouter('sistema', 'usuario');

    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).model,
    ).toBe('openai/gpt-5.6-luna');
  });

  it('deve consultar o OpenRouter com modelo, segredo e JSON estruturado', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    process.env.OPENROUTER_MODEL = 'modelo-teste';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'modelo-real',
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    });

    await expect(callOpenRouter('sistema', 'usuario')).resolves.toEqual({
      content: '{"ok":true}',
      model: 'modelo-real',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
        }),
        body: expect.stringContaining('"model":"modelo-teste"'),
      }),
    );
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body),
    ).toEqual(
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
  });

  it('deve repetir sem response_format quando o provedor rejeitar a primeira chamada', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'response_format não suportado',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'modelo-real',
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      });

    await expect(callOpenRouter('sistema', 'usuario')).resolves.toEqual({
      content: '{"ok":true}',
      model: 'modelo-real',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body),
    ).not.toHaveProperty('response_format');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[callOpenRouter] OpenRouter respondeu',
      400,
      'response_format não suportado',
    );
  });

  it('deve retornar 502 quando a tentativa e o retry falharem', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'primeiro erro',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => 'segundo erro',
      });

    await expect(callOpenRouter('sistema', 'usuario')).rejects.toMatchObject({
      statusCode: 502,
      message: 'Falha ao consultar o provedor de IA',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[callOpenRouter] OpenRouter respondeu',
      422,
      'segundo erro',
    );
  });

  it('deve converter falha do provedor em erro 502', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    await expect(callOpenRouter('sistema', 'usuario')).rejects.toMatchObject({
      statusCode: 502,
      message: 'Falha ao consultar o provedor de IA',
    });
  });

  it('deve limitar cinco gerações no mesmo dia', async () => {
    const query = { where: jest.fn().mockReturnThis(), get: jest.fn() };
    query.get.mockResolvedValue({ size: 5 });
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ collection: jest.fn(() => query) })),
      })),
    };

    await expect(checkDailyLimit('user-1')).rejects.toMatchObject({
      statusCode: 429,
      message: 'Limite diário de sugestões atingido',
    });
  });

  it('deve bloquear a sexta regeneração pelo histórico de uso', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    compareWithWalletMock.mockResolvedValue(comparison);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'modelo',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Resumo',
                items: [
                  {
                    ticker: 'HGLG11',
                    action: 'hold',
                    priority: 1,
                    rationale: 'Mantenha.',
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    let usageCount = 0;
    const usageDoc = {
      set: jest.fn().mockImplementation(async () => {
        usageCount += 1;
      }),
    };
    const usageQuery = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockImplementation(async () => ({ size: usageCount })),
      doc: jest.fn(() => usageDoc),
    };
    const suggestionDoc = {
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: jest.fn(),
    };
    const userDoc = {
      collection: jest.fn((name: string) =>
        name === 'aiSuggestionUsage'
          ? usageQuery
          : { doc: jest.fn(() => suggestionDoc) },
      ),
    };
    firestoreMock = {
      collection: jest.fn((name: string) => {
        if (name === 'quotes') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'HGLG11',
                  data: () => ({ monthlyDividend: 1.25 }),
                },
              ],
            }),
          };
        }
        return { doc: jest.fn(() => userDoc) };
      }),
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await generateSuggestion('user-1', 'wallet-1', '2026-09', 'renda', true);
    }

    await expect(
      generateSuggestion('user-1', 'wallet-1', '2026-09', 'renda', true),
    ).rejects.toMatchObject({
      statusCode: 429,
      message: 'Limite diário de sugestões atingido',
    });
    expect(usageQuery.get).toHaveBeenCalledTimes(6);
    expect(usageDoc.set).toHaveBeenCalledTimes(5);
    expect(usageDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestionId: 'wallet-1_2026-09_renda',
        createdAt: expect.any(String),
      }),
    );
  });

  it('deve retornar a sugestão salva sem consultar a IA', async () => {
    const saved = { id: 'wallet-1_2026-09_renda', summary: 'Salva' };
    const doc = {
      get: jest
        .fn()
        .mockResolvedValue({ exists: true, id: saved.id, data: () => saved }),
    };
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({ doc: jest.fn(() => doc) })),
        })),
      })),
    };

    await expect(
      getSavedSuggestion('user-1', 'wallet-1', '2026-09', 'renda'),
    ).resolves.toEqual(saved);
    expect(doc.get).toHaveBeenCalled();
  });

  it('deve gerar uma nova sugestão quando force estiver ativo', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    compareWithWalletMock.mockResolvedValue({
      ...comparison,
      recommended: {
        ...comparison.recommended,
        renda: [
          ...comparison.recommended.renda,
          {
            ticker: 'VISC11',
            segment: 'Shoppings',
            weight: 0.1,
            closePrice: 100,
          },
        ],
      },
      items: [
        ...comparison.items,
        {
          ticker: 'VISC11',
          recommendedWeight: 0.1,
          currentWeight: 0,
          quantity: 0,
          currentValue: 0,
          status: 'missing',
        },
      ],
    });
    computeMonthlyIncomeMock.mockResolvedValue({
      byTicker: [],
      total: 15.5,
      totalFromFridge: 13,
      monthlyDividendByTicker: new Map([['HGLG11', 1.25]]),
    });
    listQualifiedInvestorTickersMock.mockResolvedValue(new Set(['HGLG11']));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'modelo',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Resumo',
                items: [
                  {
                    ticker: 'HGLG11',
                    action: 'buy',
                    priority: 1,
                    rationale: 'Compre ou redistribua.',
                    suggestedAmount: 100,
                    fallbackAllocations: [{ ticker: 'VISC11', amount: 100 }],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    const doc = {
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: jest.fn(),
    };
    const query = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ size: 0 }),
    };
    firestoreMock = {
      collection: jest.fn((name: string) => {
        if (name === 'quotes') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'HGLG11',
                  data: () => ({ monthlyDividend: 1.25 }),
                },
              ],
            }),
          };
        }
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({ size: 0 }),
              doc: jest.fn(() => doc),
            })),
          })),
        };
      }),
    };

    const result = await generateSuggestion(
      'user-1',
      'wallet-1',
      '2026-09',
      'renda',
      true,
    );

    expect(result).toMatchObject({
      walletId: 'wallet-1',
      month: '2026-09',
      tab: 'renda',
      summary: 'Resumo',
      projectedDividends: 15.5,
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        qualifiedInvestor: true,
        fallbackAllocations: [
          expect.objectContaining({ ticker: 'VISC11', amount: 100 }),
        ],
      }),
    );
    expect(global.fetch).toHaveBeenCalled();
    expect(doc.set).toHaveBeenCalled();
  });

  it('deve reutilizar cache quando o aporte for igual', async () => {
    const saved = {
      id: 'wallet-1_2026-09_renda',
      walletId: 'wallet-1',
      month: '2026-09',
      tab: 'renda',
      contribution: 500,
      historyMonths: [],
    };
    const doc = {
      get: jest
        .fn()
        .mockResolvedValue({ exists: true, id: saved.id, data: () => saved }),
    };
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({ doc: jest.fn(() => doc) })),
        })),
      })),
    };

    await expect(
      generateSuggestion('user-1', 'wallet-1', '2026-09', 'renda', false, 500),
    ).resolves.toEqual(saved);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('deve ignorar cache quando o histórico salvo estiver desatualizado', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    compareWithWalletMock.mockResolvedValue(comparison);
    getRecommendedWalletMock.mockResolvedValue({
      month: '2026-08',
      revision: 2,
      renda: [
        {
          ticker: 'HGLG11',
          weight: 0.2,
          segment: 'Logísticos',
        },
      ],
      ganho: [],
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'modelo',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Novo resumo',
                items: [
                  {
                    ticker: 'HGLG11',
                    action: 'hold',
                    priority: 1,
                    rationale: 'Mantenha.',
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    const savedDoc = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        id: 'wallet-1_2026-09_renda',
        data: () => ({
          id: 'wallet-1_2026-09_renda',
          walletId: 'wallet-1',
          month: '2026-09',
          tab: 'renda',
          contribution: 500,
          historyMonths: ['2026-08:1'],
        }),
      }),
      set: jest.fn(),
    };
    const generatedDoc = {
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: jest.fn(),
    };
    const query = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ size: 0 }),
    };
    firestoreMock = {
      collection: jest.fn((name: string) => {
        if (name === 'quotes') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }
        return {
          doc: jest.fn((id?: string) => ({
            get: id ? savedDoc.get : undefined,
            set: id ? savedDoc.set : undefined,
            collection: jest.fn((collectionName: string) => {
              if (collectionName === 'aiSuggestions') {
                return { doc: jest.fn(() => generatedDoc) };
              }
              return {
                ...query,
                doc: jest.fn(() => ({ set: jest.fn() })),
              };
            }),
          })),
        };
      }),
    };

    await generateSuggestion(
      'user-1',
      'wallet-1',
      '2026-09',
      'renda',
      false,
      500,
    );

    expect(global.fetch).toHaveBeenCalled();
    expect(getRecommendedWalletMock).toHaveBeenCalledWith('2026-08');
  });

  it('deve persistir os meses do histórico usado na sugestão', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    compareWithWalletMock.mockResolvedValue(comparison);
    getRecommendedWalletMock.mockImplementation(async (month: string) =>
      month === '2026-08'
        ? ({
            month,
            renda: [
              {
                ticker: 'HGLG11',
                weight: 0.2,
                segment: 'Logísticos',
              },
            ],
            ganho: [],
            revision: 2,
          } as RecommendedWallet)
        : null,
    );
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'modelo',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Resumo',
                items: [
                  {
                    ticker: 'HGLG11',
                    action: 'hold',
                    priority: 1,
                    rationale: 'Mantenha.',
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    const suggestionDoc = {
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: jest.fn(),
    };
    const usageDoc = { set: jest.fn() };
    const usageQuery = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ size: 0 }),
      doc: jest.fn(() => usageDoc),
    };
    const userDoc = {
      collection: jest.fn((name: string) =>
        name === 'aiSuggestionUsage'
          ? usageQuery
          : { doc: jest.fn(() => suggestionDoc) },
      ),
    };
    firestoreMock = {
      collection: jest.fn((name: string) =>
        name === 'quotes'
          ? { get: jest.fn().mockResolvedValue({ docs: [] }) }
          : { doc: jest.fn(() => userDoc) },
      ),
    };

    await generateSuggestion('user-1', 'wallet-1', '2026-09', 'renda', true);

    expect(suggestionDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        historyMonths: ['2026-08:2'],
        input: expect.objectContaining({
          history: [expect.objectContaining({ month: '2026-08' })],
        }),
      }),
    );
  });

  it('deve ignorar cache quando o aporte for diferente', async () => {
    process.env.OPENROUTER_API_KEY = 'secret';
    compareWithWalletMock.mockResolvedValue(comparison);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'modelo',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Novo resumo',
                items: [
                  {
                    ticker: 'HGLG11',
                    action: 'buy',
                    priority: 1,
                    rationale: 'Aporte maior.',
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    const savedDoc = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        id: 'wallet-1_2026-09_renda',
        data: () => ({
          id: 'wallet-1_2026-09_renda',
          walletId: 'wallet-1',
          month: '2026-09',
          tab: 'renda',
          contribution: 500,
        }),
      }),
      set: jest.fn(),
    };
    const query = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ size: 0 }),
    };
    firestoreMock = {
      collection: jest.fn((name: string) => {
        if (name === 'quotes') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'HGLG11',
                  data: () => ({ monthlyDividend: 1.25 }),
                },
              ],
            }),
          };
        }
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              ...query,
              doc: jest.fn(() => savedDoc),
            })),
          })),
        };
      }),
    };

    const result = await generateSuggestion(
      'user-1',
      'wallet-1',
      '2026-09',
      'renda',
      false,
      600,
    );

    expect(result).toMatchObject({
      summary: 'Novo resumo',
      contribution: 600,
      projectedDividends: 2.5,
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(savedDoc.set).toHaveBeenCalled();
  });

  it('deve gerar ids determinísticos', () => {
    expect(suggestionId('wallet-1', '2026-09', 'ganho')).toBe(
      'wallet-1_2026-09_ganho',
    );
  });
});
