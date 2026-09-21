let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

jest.mock('../../src/alerts/alert-mail.service', () => ({
  sendAlertEmails: jest.fn().mockResolvedValue(0),
}));

jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import { sendAlertEmails } from '../../src/alerts/alert-mail.service';
import {
  checkAllTargetPrices,
  checkUserTargetPrices,
} from '../../src/alerts/target-price.service';

type FridgeSeed = {
  id: string;
  name: string;
  items: Record<string, unknown>[];
};

type OpenAlertSeed = {
  id: string;
  data: Record<string, unknown>;
};

/**
 * Monta um Firestore de mentira com as coleções que o job percorre:
 * `quotes`, `users/{uid}/fridges/{id}/fridgeItems` e `users/{uid}/alerts`.
 */
function seedFirestore(options: {
  quotes?: Record<string, number>;
  fridges?: FridgeSeed[];
  openAlerts?: OpenAlertSeed[];
  users?: string[];
}) {
  const alertSet = jest.fn().mockResolvedValue(undefined);
  const alertUpdate = jest.fn().mockResolvedValue(undefined);

  const alertsCollection = {
    doc: jest.fn(() => ({ set: alertSet, update: alertUpdate })),
    where: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({
        docs: (options.openAlerts ?? []).map((alert) => ({
          id: alert.id,
          data: () => alert.data,
        })),
      }),
    })),
  };

  // Itens por geladeira: o serviço chega neles por
  // `fridges/{id}/fridgeItems` (paths.ts), não pela ref do snapshot.
  const itemsByFridge = new Map(
    (options.fridges ?? []).map((fridge) => [
      fridge.id,
      {
        get: jest.fn().mockResolvedValue({
          docs: fridge.items.map((item, index) => ({
            id: `item-${index}`,
            data: () => item,
          })),
        }),
      },
    ]),
  );

  const fridgesCollection = {
    get: jest.fn().mockResolvedValue({
      docs: (options.fridges ?? []).map((fridge) => ({
        id: fridge.id,
        data: () => ({ name: fridge.name }),
      })),
    }),
    doc: jest.fn((fridgeId: string) => ({
      collection: jest.fn(() => itemsByFridge.get(fridgeId)),
    })),
  };

  const userDoc = {
    collection: jest.fn((name: string) => {
      if (name === 'fridges') return fridgesCollection;
      if (name === 'alerts') return alertsCollection;
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  firestoreMock = {
    collection: jest.fn((name: string) => {
      if (name === 'quotes') {
        return {
          get: jest.fn().mockResolvedValue({
            docs: Object.entries(options.quotes ?? {}).map(
              ([ticker, price]) => ({
                id: ticker.toLowerCase(),
                data: () => ({ ticker, price }),
              }),
            ),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn(() => userDoc),
          listDocuments: jest
            .fn()
            .mockResolvedValue(
              (options.users ?? ['user-1']).map((id) => ({ id })),
            ),
        };
      }
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  return { alertSet, alertUpdate, alertsCollection, fridgesCollection };
}

const item = (overrides: Record<string, unknown> = {}) => ({
  ticker: 'HGLG11',
  quantity: 10,
  transferredPrice: 100,
  targetPrice: 120,
  ...overrides,
});

describe('TargetPriceService – detecção do preço-alvo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(functionsLogger, 'error').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve criar alerta quando a cotação atinge o preço-alvo', async () => {
    const { alertSet } = seedFirestore({
      quotes: { HGLG11: 125 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertSet).toHaveBeenCalledTimes(1);
    expect(alertSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fridge-1_HGLG11',
        fridgeId: 'fridge-1',
        fridgeName: 'Geladeira FIIs',
        ticker: 'HGLG11',
        targetPrice: 120,
        currentPrice: 125,
        status: 'open',
      }),
    );
    expect(result.created).toHaveLength(1);
    expect(result.created[0].ticker).toBe('HGLG11');
  });

  it('deve criar alerta quando a cotação é exatamente igual ao alvo', async () => {
    const { alertSet } = seedFirestore({
      quotes: { HGLG11: 120 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
    });

    await checkUserTargetPrices('user-1');

    expect(alertSet).toHaveBeenCalledTimes(1);
  });

  it('não deve criar alerta quando a cotação está abaixo do alvo', async () => {
    const { alertSet } = seedFirestore({
      quotes: { HGLG11: 119.99 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertSet).not.toHaveBeenCalled();
    expect(result.created).toHaveLength(0);
  });

  it('não deve duplicar alerta enquanto já houver um aberto para o mesmo item', async () => {
    const { alertSet } = seedFirestore({
      quotes: { HGLG11: 130 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: { ticker: 'HGLG11', fridgeId: 'fridge-1', status: 'open' },
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertSet).not.toHaveBeenCalled();
    expect(result.created).toHaveLength(0);
  });

  it('deve rearmar o alerta quando o preço volta abaixo do alvo', async () => {
    const { alertUpdate, alertsCollection } = seedFirestore({
      quotes: { HGLG11: 110 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: { ticker: 'HGLG11', fridgeId: 'fridge-1', status: 'open' },
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertsCollection.doc).toHaveBeenCalledWith('fridge-1_HGLG11');
    expect(alertUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cleared',
        clearedAt: expect.any(String),
      }),
    );
    expect(result.cleared).toEqual(['fridge-1_HGLG11']);
  });

  it('deve rearmar o alerta quando o item sai da geladeira', async () => {
    const { alertUpdate } = seedFirestore({
      quotes: { HGLG11: 130 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: { ticker: 'HGLG11', fridgeId: 'fridge-1', status: 'open' },
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cleared' }),
    );
    expect(result.cleared).toEqual(['fridge-1_HGLG11']);
  });

  it('deve ignorar item sem preço-alvo definido', async () => {
    const { alertSet } = seedFirestore({
      quotes: { HGLG11: 130 },
      fridges: [
        {
          id: 'fridge-1',
          name: 'Geladeira FIIs',
          items: [item({ targetPrice: 0 }), item({ targetPrice: undefined })],
        },
      ],
    });

    await checkUserTargetPrices('user-1');

    expect(alertSet).not.toHaveBeenCalled();
  });

  it('deve ignorar item sem cotação disponível', async () => {
    const { alertSet } = seedFirestore({
      quotes: {},
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
    });

    await checkUserTargetPrices('user-1');

    expect(alertSet).not.toHaveBeenCalled();
  });

  it('deve comparar o ticker sem depender de caixa', async () => {
    const { alertSet } = seedFirestore({
      quotes: { hglg11: 130 },
      fridges: [
        {
          id: 'fridge-1',
          name: 'Geladeira FIIs',
          items: [item({ ticker: 'hglg11' })],
        },
      ],
    });

    await checkUserTargetPrices('user-1');

    expect(alertSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fridge-1_HGLG11', ticker: 'HGLG11' }),
    );
  });

  it('deve ler as cotações uma única vez por usuário processado', async () => {
    seedFirestore({
      quotes: { HGLG11: 130 },
      fridges: [
        {
          id: 'fridge-1',
          name: 'Geladeira FIIs',
          items: [item(), item({ ticker: 'MXRF11' })],
        },
      ],
    });

    await checkUserTargetPrices('user-1');

    const quotesCalls = firestoreMock.collection.mock.calls.filter(
      ([name]: [string]) => name === 'quotes',
    );
    expect(quotesCalls).toHaveLength(1);
  });
});

describe('TargetPriceService – casos que duplicariam o aviso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(functionsLogger, 'error').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve criar um único alerta para o mesmo ticker repetido na geladeira', async () => {
    // O mesmo ticker pode entrar duas vezes na geladeira (ex.: posições de
    // duas carteiras): nada impede isso no CRUD, e o id do alerta é por
    // (geladeira, ticker).
    const { alertSet } = seedFirestore({
      quotes: { PETR4: 46 },
      fridges: [
        {
          id: 'fridge-1',
          name: 'Geladeira FIIs',
          items: [
            item({ ticker: 'PETR4', targetPrice: 40 }),
            item({ ticker: 'PETR4', targetPrice: 45 }),
          ],
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertSet).toHaveBeenCalledTimes(1);
    expect(result.created).toHaveLength(1);
  });

  it('não deve rearmar alerta aberto quando a cotação está indisponível', async () => {
    // Sem cotação não dá para afirmar que o preço caiu; rearmar aqui faria o
    // job recriar o alerta na execução seguinte e avisar duas vezes.
    const { alertUpdate } = seedFirestore({
      quotes: {},
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: { ticker: 'HGLG11', fridgeId: 'fridge-1', status: 'open' },
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertUpdate).not.toHaveBeenCalled();
    expect(result.cleared).toHaveLength(0);
  });

  it('deve rearmar alerta de item que saiu da geladeira mesmo sem cotação', async () => {
    const { alertUpdate } = seedFirestore({
      quotes: {},
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: { ticker: 'HGLG11', fridgeId: 'fridge-1', status: 'open' },
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cleared' }),
    );
    expect(result.cleared).toEqual(['fridge-1_HGLG11']);
  });

  it('deve rearmar quando o alvo foi removido do item, mesmo sem cotação', async () => {
    const { alertUpdate } = seedFirestore({
      quotes: {},
      fridges: [
        {
          id: 'fridge-1',
          name: 'Geladeira FIIs',
          items: [item({ targetPrice: 0 })],
        },
      ],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: { ticker: 'HGLG11', fridgeId: 'fridge-1', status: 'open' },
        },
      ],
    });

    await checkUserTargetPrices('user-1');

    expect(alertUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cleared' }),
    );
  });
});

describe('TargetPriceService – avisos pendentes de execuções anteriores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(functionsLogger, 'error').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve devolver alerta aberto que ficou sem notifiedAt', async () => {
    const { alertSet } = seedFirestore({
      quotes: { HGLG11: 130 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: {
            fridgeId: 'fridge-1',
            fridgeName: 'Geladeira FIIs',
            ticker: 'HGLG11',
            targetPrice: 120,
            currentPrice: 130,
            status: 'open',
            createdAt: '2026-09-17T22:15:00Z',
          },
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(alertSet).not.toHaveBeenCalled();
    expect(result.created).toHaveLength(0);
    expect(result.pendingNotification).toHaveLength(1);
    expect(result.pendingNotification[0].id).toBe('fridge-1_HGLG11');
  });

  it('não deve devolver alerta aberto que já foi notificado', async () => {
    seedFirestore({
      quotes: { HGLG11: 130 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: {
            ticker: 'HGLG11',
            status: 'open',
            notifiedAt: '2026-09-17T22:16:00Z',
          },
        },
      ],
    });

    const result = await checkUserTargetPrices('user-1');

    expect(result.pendingNotification).toHaveLength(0);
  });
});

describe('TargetPriceService – execução do job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(functionsLogger, 'error').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve percorrer todos os usuários cadastrados', async () => {
    const { alertSet } = seedFirestore({
      quotes: { HGLG11: 125 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      users: ['user-1', 'user-2', 'user-3'],
    });

    await checkAllTargetPrices();

    expect(alertSet).toHaveBeenCalledTimes(3);
  });

  it('deve reutilizar as cotações entre os usuários em vez de reler por usuário', async () => {
    seedFirestore({
      quotes: { HGLG11: 125 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      users: ['user-1', 'user-2', 'user-3'],
    });

    await checkAllTargetPrices();

    const quotesCalls = firestoreMock.collection.mock.calls.filter(
      ([name]: [string]) => name === 'quotes',
    );
    expect(quotesCalls).toHaveLength(1);
  });
});

describe('TargetPriceService – notificação dos alertas criados', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(functionsLogger, 'error').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve enviar e-mail dos alertas criados de cada usuário', async () => {
    seedFirestore({
      quotes: { HGLG11: 125 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      users: ['user-1', 'user-2'],
    });

    await checkAllTargetPrices();

    expect(sendAlertEmails).toHaveBeenCalledTimes(2);
    expect(sendAlertEmails).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([expect.objectContaining({ ticker: 'HGLG11' })]),
      expect.any(Date),
    );
  });

  it('não deve enviar e-mail quando nenhum alerta é criado', async () => {
    seedFirestore({
      quotes: { HGLG11: 100 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
    });

    await checkAllTargetPrices();

    expect(sendAlertEmails).not.toHaveBeenCalled();
  });

  it('deve concluir o job mesmo se a notificação de um usuário falhar', async () => {
    seedFirestore({
      quotes: { HGLG11: 125 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      users: ['user-1', 'user-2'],
    });
    (sendAlertEmails as jest.Mock).mockRejectedValueOnce(
      new Error('mail indisponível'),
    );

    await expect(checkAllTargetPrices()).resolves.toBeUndefined();
    expect(functionsLogger.error).toHaveBeenCalled();
  });
});

describe('TargetPriceService – envio dos avisos pelo job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(functionsLogger, 'error').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve tentar de novo o aviso que falhou numa execução anterior', async () => {
    seedFirestore({
      quotes: { HGLG11: 130 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      openAlerts: [
        {
          id: 'fridge-1_HGLG11',
          data: {
            fridgeId: 'fridge-1',
            fridgeName: 'Geladeira FIIs',
            ticker: 'HGLG11',
            targetPrice: 120,
            currentPrice: 130,
            status: 'open',
            createdAt: '2026-09-17T22:15:00Z',
          },
        },
      ],
    });

    await checkAllTargetPrices();

    expect(sendAlertEmails).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'fridge-1_HGLG11' }),
      ]),
      expect.any(Date),
    );
  });

  it('não deve notificar usuários em paralelo (limite de req/s do provedor)', async () => {
    seedFirestore({
      quotes: { HGLG11: 125 },
      fridges: [{ id: 'fridge-1', name: 'Geladeira FIIs', items: [item()] }],
      users: ['user-1', 'user-2', 'user-3'],
    });

    let running = 0;
    let maxConcurrent = 0;
    (sendAlertEmails as jest.Mock).mockImplementation(async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
      return 1;
    });

    await checkAllTargetPrices();

    expect(sendAlertEmails).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBe(1);
  });
});
