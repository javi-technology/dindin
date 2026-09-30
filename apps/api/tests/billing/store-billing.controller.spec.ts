import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

const registerMock = jest.fn();
const applyMock = jest.fn();
const getVerifierMock = jest.fn();
const verifyMock = jest.fn();

jest.mock('../../src/billing/store/store-purchase.service', () => ({
  ...jest.requireActual('../../src/billing/store/store-purchase.service'),
  registerStorePurchase: (...a: unknown[]) => registerMock(...a),
  applyStoreNotification: (...a: unknown[]) => applyMock(...a),
}));

jest.mock('../../src/billing/store/store-validators', () => ({
  ...jest.requireActual('../../src/billing/store/store-validators'),
  getStoreNotificationVerifier: (...a: unknown[]) => getVerifierMock(...a),
}));

jest.mock('../../src/shared/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import {
  handleStoreNotification,
  registerStorePurchaseHandler,
} from '../../src/billing/store/store-billing.controller';
import { StoreBillingError } from '../../src/billing/store/store-errors';
import { InvalidNotificationError } from '../../src/billing/store/store-validators';

function app() {
  const a = express();
  a.use(express.json());
  a.post(
    '/purchase',
    (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { uid: string } }).user = { uid: 'alice' };
      next();
    },
    registerStorePurchaseHandler,
  );
  a.post('/apple', handleStoreNotification('apple'));
  a.post('/google', handleStoreNotification('google'));
  return a;
}

const body = {
  platform: 'apple',
  productId: 'dindin_basic_monthly',
  credential: 'recibo',
};

beforeEach(() => {
  jest.clearAllMocks();
  getVerifierMock.mockReturnValue({ verify: verifyMock });
});

describe('POST /purchase', () => {
  it('devolve a assinatura pública depois da validação', async () => {
    registerMock.mockResolvedValue({ status: 'active', interval: 'month' });
    const res = await request(app()).post('/purchase').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'active' });
    expect(registerMock).toHaveBeenCalledWith({ uid: 'alice', ...body });
  });

  it.each([
    [{ ...body, platform: 'windows' }],
    [{ ...body, productId: '' }],
    [{ ...body, credential: undefined }],
    [{}],
  ])('recusa corpo inválido %j com 400', async (payload) => {
    const res = await request(app()).post('/purchase').send(payload);
    expect(res.status).toBe(400);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('repassa status e code do erro de negócio', async () => {
    registerMock.mockRejectedValue(
      new StoreBillingError('Assinatura já ativa', 409, 'ALREADY_SUBSCRIBED'),
    );
    const res = await request(app()).post('/purchase').send(body);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Assinatura já ativa',
      code: 'ALREADY_SUBSCRIBED',
    });
  });

  it('não expõe erro interno', async () => {
    registerMock.mockRejectedValue(new Error('segredo da loja'));
    const res = await request(app()).post('/purchase').send(body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('segredo');
  });
});

describe('webhooks das lojas', () => {
  const evento = {
    originalId: 'orig-1',
    info: { status: 'canceled', productId: 'dindin_basic_monthly' },
  };

  it('aplica a notificação autenticada', async () => {
    verifyMock.mockResolvedValue(evento);
    const res = await request(app()).post('/google').send({ x: 1 });
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledWith({
      platform: 'google',
      originalId: 'orig-1',
      info: evento.info,
    });
  });

  it('recusa notificação que não passa na verificação, sem aplicar', async () => {
    verifyMock.mockRejectedValue(new InvalidNotificationError());
    const res = await request(app()).post('/apple').send({ x: 1 });
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('responde 503 quando a loja não está configurada', async () => {
    getVerifierMock.mockImplementation(() => {
      throw new StoreBillingError('indisponível', 503, 'STORE_NOT_CONFIGURED');
    });
    const res = await request(app()).post('/apple').send({});
    expect(res.status).toBe(503);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('responde 500 se falhar ao aplicar, para a loja reenviar', async () => {
    verifyMock.mockResolvedValue(evento);
    applyMock.mockRejectedValue(new Error('firestore fora'));
    const res = await request(app()).post('/apple').send({});
    expect(res.status).toBe(500);
  });

  it('ignora com 200 a notificação sem efeito (verificador devolve null)', async () => {
    verifyMock.mockResolvedValue(null);
    const res = await request(app()).post('/google').send({});
    expect(res.status).toBe(200);
    expect(applyMock).not.toHaveBeenCalled();
  });
});
