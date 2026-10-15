let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import { applyComDateEligibility } from '../../src/dividend/com-date-eligibility.service';
import { MonthlyIncomeItem } from '../../src/dividend/monthly-income.service';

// ---------------------------------------------------------------------------
// Agenda de proventos pela quantidade da data-com (issue #562)
//
// Quem tem direito ao provento é quem tinha o ativo no fim da data-com
// (#278). A agenda partia da quantidade atual: uma compra feita depois da
// data-com inflava o "A receber", e uma venda o reduzia.
//
// A foto guarda a quantidade de cada carteira e da geladeira. Cada carteira é
// comparada com a sua: uma compra na geladeira ou em outra carteira não mexe
// no pagamento das posições que não mudaram, e a soma das carteiras fecha com
// o consolidado.
// ---------------------------------------------------------------------------

const UID = 'user-1';
const TODAY = '2026-10-15';
const COM_DATE = '2026-10-09';

interface Holdings {
  wallets?: Record<string, number>;
  fridge?: number;
}

/** Fotos da data-com por `ticker/comDate`. `undefined` = foto antiga. */
function mockSnapshots(
  snapshots: Record<string, Record<string, Holdings> | undefined>,
) {
  const reads: string[] = [];
  firestoreMock = {
    collection: jest.fn((name: string) => {
      if (name !== 'dividendSync') throw new Error(`coleção ${name}`);
      return {
        doc: (ticker: string) => ({
          collection: (sub: string) => {
            if (sub !== 'snapshots') throw new Error(`subcoleção ${sub}`);
            return {
              doc: (comDate: string) => ({
                get: async () => {
                  const key = `${ticker}/${comDate}`;
                  reads.push(key);
                  if (!(key in snapshots)) return { exists: false };
                  const holdings = snapshots[key];
                  return {
                    exists: true,
                    data: () => ({
                      quantities: {},
                      takenAt: '2026-10-09T21:30:00Z',
                      ...(holdings ? { holdings } : {}),
                    }),
                  };
                },
              }),
            };
          },
        }),
      };
    }),
  };
  return reads;
}

function item(
  ticker: string,
  quantity: number,
  monthlyDividend: number,
  paymentDate = '2026-10-20',
): MonthlyIncomeItem {
  return {
    ticker,
    quantity,
    monthlyDividend,
    monthlyIncome: Math.round(quantity * monthlyDividend * 100) / 100,
    paymentDate,
  };
}

/** Quantidade atual por ticker e carteira. */
const current = (entries: Record<string, Record<string, number>>) => async () =>
  new Map(
    Object.entries(entries).map(([ticker, byWallet]) => [
      ticker,
      new Map(Object.entries(byWallet)),
    ]),
  );

const comDates = new Map([['MXRF11', COM_DATE]]);

describe('applyComDateEligibility', () => {
  it('deve tirar do pagamento as cotas compradas depois da data-com', async () => {
    mockSnapshots({
      [`MXRF11/${COM_DATE}`]: { [UID]: { wallets: { a: 10 } } },
    });

    const [result] = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      comDates,
      current({ MXRF11: { a: 19 } }),
      TODAY,
    );

    expect(result).toEqual({
      ...item('MXRF11', 19, 0.1),
      quantityAfterComDate: 9,
      scheduledQuantity: 10,
      scheduledIncome: 1,
    });
  });

  // Revisão do #564: a quantidade global incluía a geladeira, e a compra
  // feita só nela descontava das cotas da carteira.
  it('não deve mexer na carteira quando a compra foi só na geladeira', async () => {
    mockSnapshots({
      [`MXRF11/${COM_DATE}`]: { [UID]: { wallets: { a: 10 }, fridge: 0 } },
    });

    const result = await applyComDateEligibility(
      [item('MXRF11', 10, 0.1)],
      UID,
      comDates,
      current({ MXRF11: { a: 10 } }),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 10, 0.1)]);
  });

  // Revisão do #564: a compra em B descontava de A, e as visões por carteira
  // deixavam de fechar com o consolidado.
  describe('compra numa carteira e não em outra', () => {
    const snapshot = {
      [`MXRF11/${COM_DATE}`]: { [UID]: { wallets: { a: 10 } } },
    };
    const agora = current({ MXRF11: { a: 10, b: 9 } });

    it('não deve mexer na carteira que não comprou', async () => {
      mockSnapshots(snapshot);

      const result = await applyComDateEligibility(
        [item('MXRF11', 10, 0.1)],
        UID,
        comDates,
        current({ MXRF11: { a: 10 } }),
        TODAY,
      );

      expect(result).toEqual([item('MXRF11', 10, 0.1)]);
    });

    it('deve tirar tudo da carteira que comprou depois', async () => {
      mockSnapshots(snapshot);

      const [result] = await applyComDateEligibility(
        [item('MXRF11', 9, 0.1)],
        UID,
        comDates,
        current({ MXRF11: { b: 9 } }),
        TODAY,
      );

      expect(result).toMatchObject({
        quantityAfterComDate: 9,
        scheduledQuantity: 0,
        scheduledIncome: 0,
      });
    });

    it('deve fechar o consolidado com a soma das carteiras', async () => {
      mockSnapshots(snapshot);

      const [result] = await applyComDateEligibility(
        [item('MXRF11', 19, 0.1)],
        UID,
        comDates,
        agora,
        TODAY,
      );

      expect(result).toMatchObject({
        quantityAfterComDate: 9,
        scheduledQuantity: 10,
        scheduledIncome: 1,
      });
    });
  });

  // Revisão do #564: quem vendeu depois da data-com ainda recebe pela foto.
  it('deve pagar pela quantidade da foto quando houve venda depois da data-com', async () => {
    mockSnapshots({
      [`MXRF11/${COM_DATE}`]: { [UID]: { wallets: { a: 30 } } },
    });

    const [result] = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      comDates,
      current({ MXRF11: { a: 19 } }),
      TODAY,
    );

    expect(result).toEqual({
      ...item('MXRF11', 19, 0.1),
      scheduledQuantity: 30,
      scheduledIncome: 3,
    });
    // A renda mensal projetada segue a posição atual.
    expect(result.monthlyIncome).toBe(1.9);
  });

  it('deve tirar todas as cotas quando o usuário não tinha o ativo na data-com', async () => {
    mockSnapshots({
      [`GARE11/${COM_DATE}`]: { outro: { wallets: { x: 50 } } },
    });

    const [result] = await applyComDateEligibility(
      [item('GARE11', 13, 0.07)],
      UID,
      new Map([['GARE11', COM_DATE]]),
      current({ GARE11: { a: 13 } }),
      TODAY,
    );

    expect(result).toMatchObject({
      quantityAfterComDate: 13,
      scheduledQuantity: 0,
      scheduledIncome: 0,
    });
  });

  // A foto anterior a esta versão só tem o total do usuário: sem saber em
  // qual carteira estavam as cotas, vale a quantidade atual.
  it('deve ignorar a foto sem a quantidade por carteira', async () => {
    mockSnapshots({ [`MXRF11/${COM_DATE}`]: undefined });

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      comDates,
      current({ MXRF11: { a: 19 } }),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
  });

  it('não deve mexer no item quando a foto da data-com não existe', async () => {
    mockSnapshots({});

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      comDates,
      current({ MXRF11: { a: 19 } }),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
  });

  // A foto é tirada às 18h30 do próprio dia: até lá, comprar ainda dá direito.
  it.each([
    ['é hoje', '2026-10-15'],
    ['ainda não chegou', '2026-10-31'],
  ])('não deve mexer no item quando a data-com %s', async (_caso, comDate) => {
    const reads = mockSnapshots({});
    const loadCurrent = jest.fn(current({ MXRF11: { a: 19 } }));

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map([['MXRF11', comDate]]),
      loadCurrent,
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
    expect(reads).toEqual([]);
    expect(loadCurrent).not.toHaveBeenCalled();
  });

  it('não deve mexer no item sem data-com conhecida', async () => {
    const reads = mockSnapshots({});

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map(),
      current({ MXRF11: { a: 19 } }),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
    expect(reads).toEqual([]);
  });
});
