let firestoreMock: any;
const compareWithWalletMock = jest.fn();

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => firestoreMock),
}));

jest.mock('../../src/recommended-wallet/recommended-wallet.service', () => ({
  compareWithWallet: (...args: unknown[]) => compareWithWalletMock(...args),
}));

import {
  buildSuggestionInput,
  callOpenRouter,
  checkDailyLimit,
  generateSuggestion,
  getSavedSuggestion,
  parseSuggestionOutput,
  suggestionId,
} from '../../src/recommended-wallet/ai-suggestion.service';
import { buildUserPrompt } from '../../src/recommended-wallet/ai-suggestion.prompt';
import { RecommendedWalletComparison } from 'dindin-models';

describe('ai-suggestion.service', () => {
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
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    global.fetch = jest.fn();
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

  it('deve rejeitar compra de item extra', () => {
    expect(() =>
      parseSuggestionOutput(
        JSON.stringify({
          summary: 'Resumo.',
          items: [
            {
              ticker: 'XPML11',
              action: 'buy',
              priority: 1,
              rationale: 'Compre mais.',
            },
          ],
        }),
        new Map([['XPML11', 'extra']]),
      ),
    ).toThrow('Resposta inválida da IA');
  });

  it('deve rejeitar compras acima do total disponível', () => {
    expect(() =>
      parseSuggestionOutput(
        JSON.stringify({
          summary: 'Resumo.',
          items: [
            {
              ticker: 'HGLG11',
              action: 'buy',
              priority: 1,
              rationale: 'Aumente a posição.',
              suggestedAmount: 101.01,
            },
          ],
        }),
        new Map([['HGLG11', 'missing']]),
        100,
      ),
    ).toThrow('Resposta inválida da IA');
  });

  it('deve rejeitar JSON inválido', () => {
    expect(() =>
      parseSuggestionOutput('{invalido', new Map([['HGLG11', 'match']])),
    ).toThrow('Resposta inválida da IA');
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
      projectedDividends: 2.5,
    });
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
