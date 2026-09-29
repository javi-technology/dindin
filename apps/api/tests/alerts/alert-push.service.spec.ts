let firestoreMock: any;
const sendEachForMulticastMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: sendEachForMulticastMock,
  })),
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

import { Alert, DeviceToken } from 'dindin-models';
import { sendAlertPushes } from '../../src/alerts/alert-push.service';

// ---------------------------------------------------------------------------
// Notificação push do alerta de preço-alvo (issue #408)
//
// O aviso é sobre oportunidade de compra a um preço-alvo: chegar tarde reduz
// o valor do alerta, e é justamente o caso em que push se justifica sobre o
// e-mail que o usuário lê horas depois.
//
// Duas regras carregam o peso desta issue e são o que estes testes protegem:
// token inválido é descartado — ou o job acumula falhas para sempre — e o
// estado de envio é por canal, para a falha de um não marcar o alerta como
// avisado nem provocar reenvio no outro.
// ---------------------------------------------------------------------------

const alerta = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'fridge-1_HGLG11',
  fridgeId: 'fridge-1',
  fridgeName: 'Geladeira FIIs',
  ticker: 'HGLG11',
  targetPrice: 120,
  currentPrice: 119.5,
  status: 'open',
  createdAt: '2026-09-18T22:15:00Z',
  ...overrides,
});

const token = (overrides: Partial<DeviceToken> = {}): DeviceToken => ({
  token: 'token-aparelho-1',
  platform: 'android',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...overrides,
});

function seedFirestore(tokens: DeviceToken[] = [token()]) {
  const alertUpdate = jest.fn().mockResolvedValue(undefined);
  const tokenDelete = jest.fn().mockResolvedValue(undefined);
  const tokenDoc = jest.fn(() => ({ delete: tokenDelete }));

  firestoreMock = {
    collection: jest.fn((name: string) => {
      if (name !== 'users') throw new Error(`Coleção inesperada: ${name}`);

      return {
        doc: jest.fn(() => ({
          collection: jest.fn((sub: string) => {
            if (sub === 'alerts') {
              return { doc: jest.fn(() => ({ update: alertUpdate })) };
            }
            if (sub === 'deviceTokens') {
              return {
                doc: tokenDoc,
                get: jest.fn().mockResolvedValue({
                  docs: tokens.map((t) => ({ id: t.token, data: () => t })),
                }),
              };
            }
            throw new Error(`Coleção inesperada: ${sub}`);
          }),
        })),
      };
    }),
  };

  return { alertUpdate, tokenDoc, tokenDelete };
}

const sucesso = (quantidade: number) => ({
  successCount: quantidade,
  failureCount: 0,
  responses: Array.from({ length: quantidade }, () => ({ success: true })),
});

describe('AlertPushService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(functionsLogger, 'info').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(functionsLogger, 'error').mockImplementation(() => undefined);
    sendEachForMulticastMock.mockResolvedValue(sucesso(1));
  });

  afterEach(() => jest.restoreAllMocks());

  describe('envio', () => {
    it('deve enviar para os aparelhos registrados', async () => {
      seedFirestore([token(), token({ token: 'token-aparelho-2' })]);
      sendEachForMulticastMock.mockResolvedValue(sucesso(2));

      const enviados = await sendAlertPushes('user-1', [alerta()]);

      expect(sendEachForMulticastMock).toHaveBeenCalledTimes(1);
      expect(sendEachForMulticastMock.mock.calls[0][0].tokens).toEqual([
        'token-aparelho-1',
        'token-aparelho-2',
      ]);
      expect(enviados).toBe(1);
    });

    it('deve marcar o alerta como notificado por push', async () => {
      const { alertUpdate } = seedFirestore();

      await sendAlertPushes(
        'user-1',
        [alerta()],
        new Date('2026-09-19T10:00:00Z'),
      );

      expect(alertUpdate).toHaveBeenCalledWith({
        notifiedPushAt: '2026-09-19T10:00:00.000Z',
      });
    });

    it('não deve reenviar alerta já notificado por push', async () => {
      seedFirestore();

      const enviados = await sendAlertPushes('user-1', [
        alerta({ notifiedPushAt: '2026-09-18T23:00:00Z' }),
      ]);

      expect(sendEachForMulticastMock).not.toHaveBeenCalled();
      expect(enviados).toBe(0);
    });

    it('não deve tentar enviar sem token registrado', async () => {
      seedFirestore([]);

      const enviados = await sendAlertPushes('user-1', [alerta()]);

      expect(sendEachForMulticastMock).not.toHaveBeenCalled();
      expect(enviados).toBe(0);
    });
  });

  describe('conteúdo da notificação', () => {
    // A notificação aparece na tela bloqueada do aparelho: o ativo e o fato
    // bastam, e o valor da carteira não pode ficar exposto para quem pegar o
    // celular na mesa.
    it('deve informar o ativo e que o alvo foi atingido', async () => {
      seedFirestore();

      await sendAlertPushes('user-1', [alerta()]);

      const mensagem = sendEachForMulticastMock.mock.calls[0][0];
      expect(mensagem.notification.title).toContain('HGLG11');
      expect(mensagem.notification.body).toMatch(/preço-alvo/i);
    });

    it('não deve expor valores da carteira', async () => {
      seedFirestore();

      await sendAlertPushes('user-1', [alerta()]);

      const { title, body } =
        sendEachForMulticastMock.mock.calls[0][0].notification;
      expect(`${title} ${body}`).not.toMatch(/119|120|R\$/);
    });

    // Tocar na notificação abre a geladeira correspondente; sem o id, o app
    // só conseguiria abrir a tela inicial.
    it('deve levar a geladeira de destino nos dados', async () => {
      seedFirestore();

      await sendAlertPushes('user-1', [alerta()]);

      expect(sendEachForMulticastMock.mock.calls[0][0].data).toEqual({
        tipo: 'alerta-preco-alvo',
        fridgeId: 'fridge-1',
        ticker: 'HGLG11',
      });
    });
  });

  describe('token inválido', () => {
    const falhaDeToken = (codigo: string) => ({
      successCount: 0,
      failureCount: 1,
      responses: [{ success: false, error: { code: codigo } }],
    });

    // O token muda quando o usuário reinstala o app, troca de aparelho ou
    // limpa os dados. Sem descartá-lo, o job acumula falhas para sempre.
    it.each([
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument',
    ])('deve descartar o token recusado com %s', async (codigo) => {
      const { tokenDoc, tokenDelete } = seedFirestore();
      sendEachForMulticastMock.mockResolvedValue(falhaDeToken(codigo));

      await sendAlertPushes('user-1', [alerta()]);

      expect(tokenDoc).toHaveBeenCalledWith('token-aparelho-1');
      expect(tokenDelete).toHaveBeenCalled();
    });

    it('não deve descartar o token por falha temporária', async () => {
      const { tokenDelete } = seedFirestore();
      sendEachForMulticastMock.mockResolvedValue(
        falhaDeToken('messaging/internal-error'),
      );

      await sendAlertPushes('user-1', [alerta()]);

      expect(tokenDelete).not.toHaveBeenCalled();
    });

    it('não deve marcar como notificado quando nenhum aparelho recebeu', async () => {
      const { alertUpdate } = seedFirestore();
      sendEachForMulticastMock.mockResolvedValue(
        falhaDeToken('messaging/registration-token-not-registered'),
      );

      const enviados = await sendAlertPushes('user-1', [alerta()]);

      expect(alertUpdate).not.toHaveBeenCalled();
      expect(enviados).toBe(0);
    });
  });

  describe('log estruturado', () => {
    it('deve registrar o envio sem o token nem dados da carteira', async () => {
      seedFirestore();
      const info = jest.spyOn(functionsLogger, 'info');

      await sendAlertPushes('user-1', [alerta()]);

      const registrado = JSON.stringify(info.mock.calls);
      expect(registrado).toContain('sendAlertPushes');
      expect(registrado).not.toContain('token-aparelho-1');
      expect(registrado).not.toContain('119.5');
    });

    it('deve registrar a falha por canal', async () => {
      seedFirestore();
      sendEachForMulticastMock.mockRejectedValue(new Error('fcm fora do ar'));
      const error = jest.spyOn(functionsLogger, 'error');

      const enviados = await sendAlertPushes('user-1', [alerta()]);

      expect(enviados).toBe(0);
      expect(JSON.stringify(error.mock.calls)).toContain('sendAlertPushes');
    });
  });
});
