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
// Cotas compradas depois da data-com na agenda de proventos (issue #562)
//
// Quem tem direito ao provento é quem tinha o ativo no fim da data-com
// (#278). A agenda partia da quantidade atual: aplicar uma compra da Sugestão
// do mês inflava o "A receber" de um pagamento que essas cotas não recebem.
// ---------------------------------------------------------------------------

const UID = 'user-1';
const TODAY = '2026-10-15';

/** Fotos da data-com por `ticker/comDate`, com a quantidade de cada uid. */
function mockSnapshots(snapshots: Record<string, Record<string, number>>) {
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
                  reads.push(`${ticker}/${comDate}`);
                  const quantities = snapshots[`${ticker}/${comDate}`];
                  return {
                    exists: quantities !== undefined,
                    data: () =>
                      quantities === undefined
                        ? undefined
                        : { quantities, takenAt: '2026-10-09T21:30:00Z' },
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

const held = (entries: [string, number][]) => async () => new Map(entries);

describe('applyComDateEligibility', () => {
  it('deve tirar do pagamento as cotas compradas depois da data-com', async () => {
    mockSnapshots({ 'MXRF11/2026-10-09': { [UID]: 10 } });

    const [result] = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map([['MXRF11', '2026-10-09']]),
      held([['MXRF11', 19]]),
      TODAY,
    );

    expect(result).toEqual({
      ...item('MXRF11', 19, 0.1),
      quantityAfterComDate: 9,
      scheduledIncome: 1,
    });
  });

  // A renda mensal projetada olha os meses seguintes, em que as cotas novas
  // recebem: ela não muda.
  it('deve manter a renda mensal projetada', async () => {
    mockSnapshots({ 'MXRF11/2026-10-09': { [UID]: 10 } });

    const [result] = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map([['MXRF11', '2026-10-09']]),
      held([['MXRF11', 19]]),
      TODAY,
    );

    expect(result.quantity).toBe(19);
    expect(result.monthlyIncome).toBe(1.9);
  });

  it('deve tirar todas as cotas quando o usuário não tinha o ativo na data-com', async () => {
    mockSnapshots({ 'GARE11/2026-10-09': { 'outro-usuario': 50 } });

    const [result] = await applyComDateEligibility(
      [item('GARE11', 13, 0.07)],
      UID,
      new Map([['GARE11', '2026-10-09']]),
      held([['GARE11', 13]]),
      TODAY,
    );

    expect(result.quantityAfterComDate).toBe(13);
    expect(result.scheduledIncome).toBe(0);
  });

  // A foto é tirada às 18h30 do próprio dia: até lá, comprar ainda dá direito.
  it.each([
    ['é hoje', '2026-10-15'],
    ['ainda não chegou', '2026-10-31'],
  ])('não deve mexer no item quando a data-com %s', async (_caso, comDate) => {
    const reads = mockSnapshots({});

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map([['MXRF11', comDate]]),
      held([['MXRF11', 19]]),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
    expect(reads).toEqual([]);
  });

  it('não deve mexer no item sem data-com conhecida', async () => {
    const reads = mockSnapshots({});

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map(),
      held([['MXRF11', 19]]),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
    expect(reads).toEqual([]);
  });

  // Mesma regra do registro do provento: sem foto, vale a quantidade atual.
  it('não deve mexer no item quando a foto da data-com não existe', async () => {
    mockSnapshots({});

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map([['MXRF11', '2026-10-09']]),
      held([['MXRF11', 19]]),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
  });

  it('não deve mexer no item quando o usuário vendeu depois da data-com', async () => {
    mockSnapshots({ 'MXRF11/2026-10-09': { [UID]: 30 } });

    const result = await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map([['MXRF11', '2026-10-09']]),
      held([['MXRF11', 19]]),
      TODAY,
    );

    expect(result).toEqual([item('MXRF11', 19, 0.1)]);
  });

  // A foto é do usuário, não da carteira: a compra é atribuída à carteira
  // até o limite do que ela tem, para nunca inflar o pagamento.
  it('deve limitar as cotas tiradas à quantidade da carteira', async () => {
    mockSnapshots({ 'MXRF11/2026-10-09': { [UID]: 20 } });

    const [result] = await applyComDateEligibility(
      [item('MXRF11', 5, 0.1)],
      UID,
      new Map([['MXRF11', '2026-10-09']]),
      held([['MXRF11', 30]]),
      TODAY,
    );

    expect(result.quantityAfterComDate).toBe(5);
    expect(result.scheduledIncome).toBe(0);
  });

  it('não deve ler as quantidades do usuário quando nenhuma data-com passou', async () => {
    mockSnapshots({});
    const loadHeld = jest.fn(held([]));

    await applyComDateEligibility(
      [item('MXRF11', 19, 0.1)],
      UID,
      new Map([['MXRF11', '2026-10-31']]),
      loadHeld,
      TODAY,
    );

    expect(loadHeld).not.toHaveBeenCalled();
  });
});
