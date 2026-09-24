let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import {
  saveQuoteHistory,
  saveReconciledPrice,
  getQuoteHistory,
} from '../../src/quotes/quote-history.service';

describe('QuoteHistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveQuoteHistory', () => {
    it('deve salvar cotação no documento principal e no histórico', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const historyDoc = jest.fn(() => ({
        set: historySet,
      }));
      const historyCollection = {
        doc: historyDoc,
      };
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => historyCollection),
      }));
      const quotesCollection = {
        doc: quoteDoc,
      };

      firestoreMock = {
        collection: jest.fn((path: string) => {
          if (path === 'quotes') return quotesCollection;
          throw new Error(`Unexpected collection: ${path}`);
        }),
      };

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi');

      // Deve criar/atualizar o documento principal quotes/HGLG11
      expect(quotesCollection.doc).toHaveBeenCalledWith('HGLG11');
      expect(quoteSet).toHaveBeenCalledWith({
        ticker: 'HGLG11',
        price: 165.5,
        monthlyDividend: 0.92,
        updatedAt: expect.any(String),
        source: 'brapi',
      });

      // Deve criar documento no histórico com ID baseado em timestamp
      expect(historyDoc).toHaveBeenCalled();
      const historyDocId = historyDoc.mock.calls[0][0];
      // Formato esperado: YYYY-MM-DDTHH-mm-ss (timestamp sem : e .)
      expect(historyDocId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);

      expect(historySet).toHaveBeenCalledWith({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        price: 165.5,
        monthlyDividend: 0.92,
        source: 'brapi',
      });
    });

    it('deve usar source padrão "brapi" quando não informado', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('MXRF11', 10.32, 0.07);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'brapi' }),
      );
      expect(historySet).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'brapi' }),
      );
    });

    it('deve preservar monthlyDividend existente quando não informado', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            ticker: 'MXRF11',
            price: 10.32,
            monthlyDividend: 0.07,
            updatedAt: '2026-07-15T18:00:00Z',
            source: 'brapi',
          }),
        }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('MXRF11', 10.32, undefined);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyDividend: 0.07 }),
      );
      expect(historySet).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyDividend: 0.07 }),
      );
    });
    it('deve salvar a soma dos proventos de 12 meses no documento principal', async () => {
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('PETR4', 38.5, 1.25, 'brapi', '2026-07-15', 2.35);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ annualDividend: 2.35 }),
      );
    });

    it('deve preservar a soma de 12 meses existente quando o provento não vier', async () => {
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            ticker: 'PETR4',
            price: 38.5,
            monthlyDividend: 1.25,
            dividendPaymentDate: '2026-07-15',
            annualDividend: 2.35,
            updatedAt: '2026-07-15T18:00:00Z',
            source: 'brapi',
          }),
        }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('PETR4', 39, undefined);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ annualDividend: 2.35 }),
      );
    });

    it('deve salvar a data de pagamento do provento no documento principal', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi', '2026-07-14');

      expect(quoteSet).toHaveBeenCalledWith({
        ticker: 'HGLG11',
        price: 165.5,
        monthlyDividend: 0.92,
        dividendPaymentDate: '2026-07-14',
        updatedAt: expect.any(String),
        source: 'brapi',
      });
    });

    it('deve preservar a data de pagamento existente quando o provento não é informado', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            ticker: 'MXRF11',
            price: 10.32,
            monthlyDividend: 0.07,
            dividendPaymentDate: '2026-07-14',
            updatedAt: '2026-07-15T18:00:00Z',
            source: 'brapi',
          }),
        }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('MXRF11', 10.5, undefined);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyDividend: 0.07,
          dividendPaymentDate: '2026-07-14',
        }),
      );
    });

    // Horário de apuração da cotação na fonte (issue #387). Sem ele não há
    // como distinguir atraso da Brapi de falha nossa: `updatedAt` só diz
    // quando *nós* escrevemos.
    describe('horário de apuração da fonte', () => {
      function mockQuoteDoc() {
        const quoteSet = jest.fn().mockResolvedValue(undefined);
        const quoteDoc = jest.fn(() => ({
          set: quoteSet,
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              set: jest.fn().mockResolvedValue(undefined),
            })),
          })),
        }));

        firestoreMock = {
          collection: jest.fn(() => ({ doc: quoteDoc })),
        };

        return quoteSet;
      }

      it('deve gravar o horário de apuração informado pela fonte', async () => {
        const quoteSet = mockQuoteDoc();

        await saveQuoteHistory(
          'TRXF11',
          73.9,
          0.7,
          'brapi',
          '2026-09-15',
          8.4,
          '2026-09-23T21:31:00Z',
        );

        expect(quoteSet).toHaveBeenCalledWith(
          expect.objectContaining({ quotedAt: '2026-09-23T21:31:00Z' }),
        );
      });

      it('deve gravar sem o campo quando a fonte não informa o horário', async () => {
        const quoteSet = mockQuoteDoc();

        await saveQuoteHistory('TRXF11', 73.9, 0.7);

        expect(quoteSet).toHaveBeenCalledWith(
          expect.not.objectContaining({ quotedAt: expect.anything() }),
        );
      });

      it('deve manter updatedAt como o horário da escrita, não o da apuração', async () => {
        const quoteSet = mockQuoteDoc();

        await saveQuoteHistory(
          'TRXF11',
          73.9,
          0.7,
          'brapi',
          undefined,
          undefined,
          '2026-09-23T21:31:00Z',
        );

        const saved = quoteSet.mock.calls[0][0];
        expect(saved.quotedAt).toBe('2026-09-23T21:31:00Z');
        expect(saved.updatedAt).not.toBe('2026-09-23T21:31:00Z');
        expect(Date.parse(saved.updatedAt)).toBeGreaterThan(
          Date.parse('2026-09-23T21:31:00Z'),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Gravação só do preço (issue #389)
  //
  // A reconciliação noturna corrige o fechamento e nada mais. Passando pelo
  // `saveQuoteHistory` ela reescrevia também o documento mensal de proventos,
  // com `updatedAt` novo a cada noite: escrita sem fato novo, num registro que
  // só deveria mudar quando um provento é anunciado.
  // -------------------------------------------------------------------------
  describe('saveReconciledPrice', () => {
    interface Mocks {
      quoteSet: jest.Mock;
      historySet: jest.Mock;
      subcolecoes: string[];
    }

    function mockFirestore(): Mocks {
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const historySet = jest.fn().mockResolvedValue(undefined);
      const subcolecoes: string[] = [];

      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn((nome: string) => {
          subcolecoes.push(nome);
          return { doc: jest.fn(() => ({ set: historySet })) };
        }),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      return { quoteSet, historySet, subcolecoes };
    }

    const guardada = {
      ticker: 'TRXF11',
      price: 73.99,
      monthlyDividend: 0.7,
      dividendPaymentDate: '2026-09-15',
      annualDividend: 8.4,
      updatedAt: '2026-09-23T21:40:00Z',
      quotedAt: '2026-09-23T21:31:00Z',
      source: 'brapi',
    };

    it('não deve escrever no histórico mensal de proventos', async () => {
      const { subcolecoes } = mockFirestore();

      await saveReconciledPrice(
        'TRXF11',
        73.9,
        guardada,
        '2026-09-24T00:05:00Z',
      );

      expect(subcolecoes).toEqual(['history']);
      expect(subcolecoes).not.toContain('dividendHistory');
    });

    it('deve gravar o preço novo e o horário de apuração', async () => {
      const { quoteSet } = mockFirestore();

      await saveReconciledPrice(
        'TRXF11',
        73.9,
        guardada,
        '2026-09-24T00:05:00Z',
      );

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: 'TRXF11',
          price: 73.9,
          quotedAt: '2026-09-24T00:05:00Z',
        }),
      );
    });

    it('deve preservar os campos de provento já gravados', async () => {
      const { quoteSet } = mockFirestore();

      await saveReconciledPrice(
        'TRXF11',
        73.9,
        guardada,
        '2026-09-24T00:05:00Z',
      );

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyDividend: 0.7,
          dividendPaymentDate: '2026-09-15',
          annualDividend: 8.4,
        }),
      );
    });

    it('deve registrar o preço corrigido no histórico de preços', async () => {
      const { historySet } = mockFirestore();

      await saveReconciledPrice(
        'TRXF11',
        73.9,
        guardada,
        '2026-09-24T00:05:00Z',
      );

      expect(historySet).toHaveBeenCalledWith(
        expect.objectContaining({ price: 73.9, source: 'brapi' }),
      );
    });

    it('deve manter updatedAt como o horário da escrita', async () => {
      const { quoteSet } = mockFirestore();

      await saveReconciledPrice(
        'TRXF11',
        73.9,
        guardada,
        '2026-09-24T00:05:00Z',
      );

      const salvo = quoteSet.mock.calls[0][0];
      expect(salvo.updatedAt).not.toBe(guardada.updatedAt);
      expect(Date.parse(salvo.updatedAt)).toBeGreaterThan(
        Date.parse(guardada.updatedAt),
      );
    });
  });

  describe('getQuoteHistory', () => {
    it('deve retornar histórico ordenado por data decrescente', async () => {
      const historyDocs = [
        {
          id: '2026-07-15',
          data: () => ({
            date: '2026-07-15',
            price: 165.5,
            monthlyDividend: 0.92,
            source: 'brapi',
          }),
        },
        {
          id: '2026-07-14',
          data: () => ({
            date: '2026-07-14',
            price: 164.0,
            monthlyDividend: 0.91,
            source: 'brapi',
          }),
        },
      ];

      const orderByMock = jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ docs: historyDocs }),
        })),
      }));

      const historyCollection = {
        orderBy: orderByMock,
      };
      const quoteDoc = jest.fn(() => ({
        collection: jest.fn(() => historyCollection),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      const result = await getQuoteHistory('HGLG11', 30);

      expect(orderByMock).toHaveBeenCalledWith('date', 'desc');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2026-07-15',
        price: 165.5,
        monthlyDividend: 0.92,
        source: 'brapi',
      });
      expect(result[1]).toEqual({
        date: '2026-07-14',
        price: 164.0,
        monthlyDividend: 0.91,
        source: 'brapi',
      });
    });

    it('deve usar limite padrão 30 quando não informado', async () => {
      const limitMock = jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ docs: [] }),
      }));
      const orderByMock = jest.fn(() => ({ limit: limitMock }));

      firestoreMock = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({ orderBy: orderByMock })),
          })),
        })),
      };

      await getQuoteHistory('HGLG11');

      expect(limitMock).toHaveBeenCalledWith(30);
    });

    it('deve retornar array vazio quando não há histórico', async () => {
      firestoreMock = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue({ docs: [] }),
                })),
              })),
            })),
          })),
        })),
      };

      const result = await getQuoteHistory('TICKER_NOVO');

      expect(result).toEqual([]);
    });
  });
});
