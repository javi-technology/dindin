jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import { ActiveAsset } from '../../src/assets/asset.service';
import { fetchMonthlyDividends } from '../../src/quotes/dividend-fetch.service';

/**
 * Proventos vindos da B3 Listados (#599). A B3 responde com números e datas
 * em pt-BR e mistura, na mesma lista, as classes do emissor (ON, PN, UNIT) e
 * os recibos de subscrição dos FIIs; o filtro é pelo ISIN do ticker.
 */
interface B3CashDividend {
  assetIssued: string;
  isinCode: string;
  paymentDate: string;
  rate: string;
  label: string;
  lastDatePrior: string;
  relatedTo: string;
  approvedOn: string;
  remarks: string;
}

function cash(
  isin: string,
  paymentDate: string,
  rate: string,
  options: { label?: string; lastDatePrior?: string } = {},
): B3CashDividend {
  return {
    assetIssued: isin,
    isinCode: isin,
    paymentDate,
    rate,
    label: options.label ?? 'RENDIMENTO',
    lastDatePrior: options.lastDatePrior ?? '',
    relatedTo: '',
    approvedOn: '',
    remarks: '',
  };
}

// Trechos reais das respostas da B3 Listados, consultadas em 23/11/2026.
const HGLG_REAL = [
  cash('BRHGLGCTF004', '16/11/2026', '1,17000000000', {
    lastDatePrior: '30/10/2026',
  }),
  cash('BRHGLGR26M17', '16/11/2026', '1,17000000000', {
    lastDatePrior: '30/10/2026',
  }),
  cash('BRHGLGCTF004', '15/10/2026', '1,17000000000', {
    lastDatePrior: '30/09/2026',
  }),
  cash('BRHGLGR26M17', '15/10/2026', '1,09200000000', {
    lastDatePrior: '30/09/2026',
  }),
];

const ITSA_REAL = [
  cash('BRITSAACNOR0', '01/10/2026', '0,02424250000', {
    label: 'JRS CAP PROPRIO',
    lastDatePrior: '31/08/2026',
  }),
  cash('BRITSAACNPR7', '01/10/2026', '0,02424250000', {
    label: 'JRS CAP PROPRIO',
    lastDatePrior: '31/08/2026',
  }),
  cash('BRITSAACNPR7', '01/07/2026', '0,02000000000', {
    label: 'DIVIDENDO',
    lastDatePrior: '31/05/2026',
  }),
];

interface B3Routes {
  funds?: Record<string, unknown>;
  companies?: Record<string, unknown>;
  status?: Record<string, number>;
}

function fundBody(cashDividends: B3CashDividend[]) {
  return {
    code: 'X',
    cashDividends,
    stockDividends: [],
    subscriptions: [],
  };
}

// O endpoint de empresas responde com uma lista; o de fundos, com um objeto.
function companyBody(cashDividends: B3CashDividend[]) {
  return [{ code: 'X', cashDividends, stockDividends: [], subscriptions: [] }];
}

/** Lê o código do emissor do parâmetro em base64 da URL da B3. */
function decodeRequest(url: string): {
  kind: 'fund' | 'company';
  code: string;
} {
  const encoded = url.split('/').pop() as string;
  const params = JSON.parse(
    Buffer.from(decodeURIComponent(encoded), 'base64').toString('utf8'),
  ) as { identifierFund?: string; issuingCompany?: string };
  return url.includes('GetListedSupplementFunds')
    ? { kind: 'fund', code: params.identifierFund as string }
    : { kind: 'company', code: params.issuingCompany as string };
}

function mockB3(routes: B3Routes): jest.Mock {
  const fetchMock = jest.fn((url: string) => {
    const { kind, code } = decodeRequest(url);
    const status = routes.status?.[code] ?? 200;
    const table = kind === 'fund' ? routes.funds : routes.companies;
    const body =
      table?.[code] ?? (kind === 'fund' ? fundBody([]) : companyBody([]));
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(body),
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const TODAY = new Date('2026-11-20T12:00:00.000Z');

describe('DividendFetchService — fetchMonthlyDividends (B3 Listados)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('FIIs', () => {
    it('deve consultar o fundo pelo código do emissor no endpoint de fundos da B3', async () => {
      const fetchMock = mockB3({ funds: { HGLG: fundBody(HGLG_REAL) } });

      await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        TODAY,
      );

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(
        'sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListedSupplementFunds/',
      );
      expect(decodeRequest(url)).toEqual({ kind: 'fund', code: 'HGLG' });
    });

    it('deve devolver o último rendimento da cota, com data de pagamento e data-com', async () => {
      mockB3({ funds: { HGLG: fundBody(HGLG_REAL) } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('HGLG11')).toMatchObject({
        monthlyDividend: 1.17,
        paymentDate: '2026-11-16',
        comDate: '2026-10-30',
      });
    });

    // O recibo de subscrição tem ISIN próprio e, em outubro, valor diferente
    // da cota: somá-lo dobraria o provento de quem tem a cota.
    it('deve ignorar os recibos de subscrição, que têm ISIN próprio', async () => {
      mockB3({ funds: { HGLG: fundBody(HGLG_REAL) } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('HGLG11')?.paidEvents).toEqual([
        { paymentDate: '2026-10-15', rate: 1.17, comDate: '2026-09-30' },
        { paymentDate: '2026-11-16', rate: 1.17, comDate: '2026-10-30' },
      ]);
      expect(result.get('HGLG11')?.annualDividend).toBe(2.34);
    });

    it('deve ignorar amortizações e usar apenas rendimentos', async () => {
      mockB3({
        funds: {
          KNRI: fundBody([
            cash('BRKNRICTF007', '14/11/2026', '5,00000000000', {
              label: 'AMORTIZACAO',
            }),
            cash('BRKNRICTF007', '14/10/2026', '1,00000000000'),
          ]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'KNRI11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('KNRI11')?.monthlyDividend).toBe(1);
    });

    it('deve consultar REIT pelo endpoint de fundos', async () => {
      const fetchMock = mockB3({});

      await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'REIT' }],
        TODAY,
      );

      expect(decodeRequest(fetchMock.mock.calls[0][0] as string).kind).toBe(
        'fund',
      );
    });

    it('deve devolver sem provento o FII sem histórico de rendimentos', async () => {
      mockB3({ funds: { MXRF: fundBody([]) } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'MXRF11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.has('MXRF11')).toBe(false);
    });
  });

  describe('ações', () => {
    it('deve consultar a empresa pelo código do emissor no endpoint de empresas da B3', async () => {
      const fetchMock = mockB3({ companies: { ITSA: companyBody(ITSA_REAL) } });

      await fetchMonthlyDividends(
        [{ ticker: 'ITSA4', assetType: 'STOCK' }],
        TODAY,
      );

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(
        'sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/',
      );
      expect(decodeRequest(url)).toEqual({ kind: 'company', code: 'ITSA' });
    });

    // ON (3) e PN (4) do mesmo emissor têm proventos diferentes: cada ticker
    // fica só com os eventos do ISIN da sua classe.
    it('deve separar os proventos da ON e da PN pelo ISIN da classe', async () => {
      mockB3({ companies: { ITSA: companyBody(ITSA_REAL) } });

      const result = await fetchMonthlyDividends(
        [
          { ticker: 'ITSA3', assetType: 'STOCK' },
          { ticker: 'ITSA4', assetType: 'STOCK' },
        ],
        TODAY,
      );

      expect(result.get('ITSA3')?.paidEvents).toEqual([
        { paymentDate: '2026-10-01', rate: 0.0242425, comDate: '2026-08-31' },
      ]);
      expect(result.get('ITSA4')?.paidEvents).toHaveLength(2);
    });

    it('deve consultar o emissor uma vez para todos os tickers dele', async () => {
      const fetchMock = mockB3({ companies: { ITSA: companyBody(ITSA_REAL) } });

      await fetchMonthlyDividends(
        [
          { ticker: 'ITSA3', assetType: 'STOCK' },
          { ticker: 'ITSA4', assetType: 'STOCK' },
        ],
        TODAY,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('deve somar dividendos e JCP da ação nos 12 meses até hoje', async () => {
      mockB3({ companies: { ITSA: companyBody(ITSA_REAL) } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ITSA4', assetType: 'STOCK' }],
        TODAY,
      );

      expect(result.get('ITSA4')).toMatchObject({
        monthlyDividend: 0.0242425,
        paymentDate: '2026-10-01',
      });
      // A soma é arredondada em seis casas: a taxa por cota não é centavo.
      expect(result.get('ITSA4')?.annualDividend).toBeCloseTo(0.044243, 6);
    });

    it('deve usar o ISIN do certificado de depósito para a UNIT (11)', async () => {
      mockB3({
        companies: {
          TAEE: companyBody([
            cash('BRTAEEACNOR9', '27/10/2026', '0,35203605232', {
              label: 'DIVIDENDO',
            }),
            cash('BRTAEECDAM10', '27/10/2026', '1,05610815696', {
              label: 'DIVIDENDO',
            }),
          ]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'TAEE11', assetType: 'STOCK' }],
        TODAY,
      );

      expect(result.get('TAEE11')?.monthlyDividend).toBe(1.05610815696);
    });

    it('deve consultar OTHER pelo endpoint de empresas', async () => {
      const fetchMock = mockB3({});

      await fetchMonthlyDividends(
        [{ ticker: 'ABCD3', assetType: 'OTHER' }],
        TODAY,
      );

      expect(decodeRequest(fetchMock.mock.calls[0][0] as string).kind).toBe(
        'company',
      );
    });

    it('deve devolver sem provento a ação sem dividendos em dinheiro', async () => {
      mockB3({ companies: { MGLU: companyBody([]) } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'MGLU3', assetType: 'STOCK' }],
        TODAY,
      );

      expect(result.has('MGLU3')).toBe(false);
    });
  });

  describe('ETFs', () => {
    it('não deve consultar proventos de ETFs', async () => {
      const fetchMock = mockB3({});

      const result = await fetchMonthlyDividends(
        [{ ticker: 'BOVA11', assetType: 'ETF' }],
        TODAY,
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });
  });

  describe('formato pt-BR da B3', () => {
    it('deve converter valor com vírgula decimal e separador de milhar', async () => {
      mockB3({
        funds: {
          ABCD: fundBody([cash('BRABCDCTF000', '14/11/2026', '1.234,5')]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('ABCD11')?.monthlyDividend).toBe(1234.5);
    });

    it('deve ignorar evento com valor que não é número', async () => {
      mockB3({
        funds: {
          ABCD: fundBody([
            cash('BRABCDCTF000', '14/11/2026', 'abc'),
            cash('BRABCDCTF000', '14/10/2026', '0,90'),
          ]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('ABCD11')?.monthlyDividend).toBe(0.9);
    });

    // `new Date('')` e afins não podem virar 1970-01-01.
    it.each(['', '31/02/2026', '2026-11-14', 'abc'])(
      'não deve gerar data de pagamento a partir de %p',
      async (paymentDate) => {
        mockB3({
          funds: {
            ABCD: fundBody([cash('BRABCDCTF000', paymentDate, '0,90')]),
          },
        });

        const result = await fetchMonthlyDividends(
          [{ ticker: 'ABCD11', assetType: 'FII' }],
          TODAY,
        );

        expect(result.get('ABCD11')).toEqual({ monthlyDividend: 0.9 });
      },
    );

    it('deve contar uma vez o evento repetido na resposta', async () => {
      const event = cash('BRABCDCTF000', '14/11/2026', '0,90', {
        lastDatePrior: '31/10/2026',
      });
      mockB3({ funds: { ABCD: fundBody([event, { ...event }]) } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('ABCD11')?.paidEvents).toHaveLength(1);
      expect(result.get('ABCD11')?.annualDividend).toBe(0.9);
    });
  });

  describe('janela de 12 meses e data-com (#112, #278)', () => {
    it('deve deixar fora da soma o pago há mais de 12 meses', async () => {
      mockB3({
        funds: {
          ABCD: fundBody([
            cash('BRABCDCTF000', '14/11/2025', '0,80'),
            cash('BRABCDCTF000', '14/11/2026', '0,90'),
          ]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('ABCD11')?.annualDividend).toBe(0.9);
    });

    it('deve zerar a soma quando nada foi pago nos últimos 12 meses', async () => {
      mockB3({
        funds: {
          ABCD: fundBody([cash('BRABCDCTF000', '14/10/2025', '0,80')]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('ABCD11')?.annualDividend).toBe(0);
      expect(result.get('ABCD11')?.paidEvents).toEqual([]);
    });

    // O anunciado fica fora da soma, senão um pagador mensal somaria 13
    // meses; com data-com, ele entra para a foto da quantidade (#278).
    it('deve separar o anunciado com data-com dos pagos', async () => {
      mockB3({
        funds: {
          ABCD: fundBody([
            cash('BRABCDCTF000', '14/12/2026', '1,00', {
              lastDatePrior: '30/11/2026',
            }),
            cash('BRABCDCTF000', '14/11/2026', '0,90', {
              lastDatePrior: '31/10/2026',
            }),
          ]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('ABCD11')).toEqual({
        monthlyDividend: 1,
        paymentDate: '2026-12-14',
        comDate: '2026-11-30',
        annualDividend: 0.9,
        paidEvents: [
          { paymentDate: '2026-11-14', rate: 0.9, comDate: '2026-10-31' },
        ],
        upcomingEvents: [
          { paymentDate: '2026-12-14', rate: 1, comDate: '2026-11-30' },
        ],
      });
    });

    it('não deve expor anunciado sem data-com', async () => {
      mockB3({
        funds: {
          ABCD: fundBody([
            cash('BRABCDCTF000', '14/12/2026', '1,00'),
            cash('BRABCDCTF000', '14/11/2026', '0,90'),
          ]),
        },
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.get('ABCD11')?.upcomingEvents).toBeUndefined();
      expect(result.get('ABCD11')?.comDate).toBeUndefined();
    });
  });

  describe('falhas', () => {
    it('deve continuar os demais emissores quando um falha', async () => {
      mockB3({
        funds: { HGLG: fundBody(HGLG_REAL) },
        status: { MXRF: 500 },
      });

      const result = await fetchMonthlyDividends(
        [
          { ticker: 'MXRF11', assetType: 'FII' },
          { ticker: 'HGLG11', assetType: 'FII' },
        ],
        TODAY,
      );

      expect(result.has('MXRF11')).toBe(false);
      expect(result.get('HGLG11')?.monthlyDividend).toBe(1.17);
      expect(functionsLogger.error).toHaveBeenCalledWith(
        'dividends.provider.issuerFailed',
        expect.objectContaining({ provider: 'b3', issuer: 'MXRF' }),
      );
    });

    it('não deve lançar quando todos os emissores falham', async () => {
      mockB3({ status: { HGLG: 500 } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.size).toBe(0);
    });

    // Endpoint sem documentação: formato novo vira aviso e "sem provento
    // conhecido", nunca provento zero.
    it('deve avisar e deixar sem provento quando a resposta muda de formato', async () => {
      mockB3({ funds: { HGLG: { dividendos: [] } } });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        TODAY,
      );

      expect(result.has('HGLG11')).toBe(false);
      expect(functionsLogger.warn).toHaveBeenCalledWith(
        'dividends.provider.unexpectedShape',
        expect.objectContaining({ provider: 'b3', issuer: 'HGLG' }),
      );
    });

    it('deve parar de consultar quando a B3 bloqueia (429)', async () => {
      const fetchMock = mockB3({
        status: Object.fromEntries(
          Array.from({ length: 30 }, (_, i) => [
            `T${String(i).padStart(3, '0')}`,
            429,
          ]),
        ),
      });
      const assets: ActiveAsset[] = Array.from({ length: 30 }, (_, i) => ({
        ticker: `T${String(i).padStart(3, '0')}11`,
        assetType: 'FII',
      }));

      const result = await fetchMonthlyDividends(assets, TODAY);

      expect(result.size).toBe(0);
      expect(fetchMock.mock.calls.length).toBeLessThan(assets.length);
    });
  });

  describe('registro', () => {
    it('deve logar os tickers com provento mas sem data de pagamento', async () => {
      mockB3({
        funds: { ABCD: fundBody([cash('BRABCDCTF000', '', '0,90')]) },
      });

      await fetchMonthlyDividends(
        [{ ticker: 'ABCD11', assetType: 'FII' }],
        TODAY,
      );

      expect(functionsLogger.warn).toHaveBeenCalledWith(
        'fetchMonthlyDividends.withoutPaymentDate',
        expect.objectContaining({ tickers: ['ABCD11'] }),
      );
    });

    it('deve devolver Map vazio sem consultar a B3 quando não há ativos', async () => {
      const fetchMock = mockB3({});

      const result = await fetchMonthlyDividends([], TODAY);

      expect(result.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
