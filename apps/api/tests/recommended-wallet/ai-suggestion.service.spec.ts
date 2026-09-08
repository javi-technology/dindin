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
    );

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
      new Set(['HGLG11']),
    );

    expect(result.items.map((item) => item.ticker)).toEqual(['HGLG11']);
    expect(result.disclaimer).toBe('Aviso.');
  });

  it('deve rejeitar JSON inválido', () => {
    expect(() =>
      parseSuggestionOutput('{invalido', new Set(['HGLG11'])),
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
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(doc.set).toHaveBeenCalled();
  });

  it('deve gerar ids determinísticos', () => {
    expect(suggestionId('wallet-1', '2026-09', 'ganho')).toBe(
      'wallet-1_2026-09_ganho',
    );
  });
});
