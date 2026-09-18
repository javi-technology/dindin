let firestoreMock: any;
const getUserMock = jest.fn();
const fetchMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ getUser: getUserMock })),
}));

import { Alert } from 'dindin-models';
import { sendAlertEmails } from '../../src/alerts/alert-mail.service';

function seedFirestore() {
  const alertUpdate = jest.fn().mockResolvedValue(undefined);
  const alertDoc = jest.fn(() => ({ update: alertUpdate }));

  firestoreMock = {
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((sub: string) => {
              if (sub === 'alerts') return { doc: alertDoc };
              throw new Error(`Coleção inesperada: ${sub}`);
            }),
          })),
        };
      }
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  return { alertUpdate, alertDoc };
}

function okResponse() {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ id: 'email-1' }),
    text: jest.fn().mockResolvedValue(''),
  };
}

function errorResponse(status = 422, body = 'domain not verified') {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({}),
    text: jest.fn().mockResolvedValue(body),
  };
}

/** Corpo JSON enviado na n-ésima chamada ao Resend. */
function requestBody(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body);
}

const alert = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'fridge-1_HGLG11',
  fridgeId: 'fridge-1',
  fridgeName: 'Geladeira FIIs',
  ticker: 'HGLG11',
  targetPrice: 120,
  currentPrice: 125.5,
  status: 'open',
  createdAt: '2026-09-18T22:15:00Z',
  ...overrides,
});

describe('AlertMailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, RESEND_API_KEY: 're_chave_secreta' };
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(okResponse());
    getUserMock.mockResolvedValue({ email: 'investidor@example.com' });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('deve enviar o e-mail pela API do Resend', async () => {
    seedFirestore();

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(sent).toBe(1);
  });

  it('deve autenticar com a RESEND_API_KEY', async () => {
    seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer re_chave_secreta',
      'Content-Type': 'application/json',
    });
  });

  it('deve enviar Idempotency-Key própria do alerta para o retry não duplicar', async () => {
    seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      'fridge-1_HGLG11_2026-09-18T22:15:00Z',
    );
  });

  it('deve endereçar o e-mail ao usuário do Firebase Auth', async () => {
    seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    expect(getUserMock).toHaveBeenCalledWith('user-1');
    expect(requestBody().to).toEqual(['investidor@example.com']);
  });

  it('deve usar o remetente do domínio configurado', async () => {
    seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    expect(requestBody().from).toBe('DinDin <alertas@javitech.online>');
  });

  it('deve permitir sobrescrever o remetente por variável de ambiente', async () => {
    seedFirestore();
    process.env.ALERT_MAIL_FROM = 'DinDin <avisos@outro.dominio>';

    await sendAlertEmails('user-1', [alert()]);

    expect(requestBody().from).toBe('DinDin <avisos@outro.dominio>');
  });

  it('deve descrever ticker, preço atual, preço-alvo e geladeira no conteúdo', async () => {
    seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    const body = requestBody();
    expect(body.subject).toContain('HGLG11');
    expect(body.subject).toContain('R$ 120,00');
    expect(body.text).toContain('R$ 125,50');
    expect(body.text).toContain('Geladeira FIIs');
    expect(body.html).toContain('HGLG11');
    expect(body.html).toContain('R$ 125,50');
  });

  it('deve incluir o link do app no e-mail', async () => {
    seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    const body = requestBody();
    expect(body.text).toContain('https://dindin-4e720.web.app/geladeira');
    expect(body.html).toContain('https://dindin-4e720.web.app/geladeira');
  });

  it('deve marcar notifiedAt no alerta após o envio', async () => {
    const { alertUpdate, alertDoc } = seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    expect(alertDoc).toHaveBeenCalledWith('fridge-1_HGLG11');
    expect(alertUpdate).toHaveBeenCalledWith({
      notifiedAt: expect.any(String),
    });
  });

  it('não deve reenviar alerta que já tem notifiedAt', async () => {
    const { alertUpdate } = seedFirestore();

    const sent = await sendAlertEmails('user-1', [
      alert({ notifiedAt: '2026-09-18T22:16:00Z' }),
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(alertUpdate).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('não deve marcar notifiedAt quando o Resend recusa o envio', async () => {
    const { alertUpdate } = seedFirestore();
    fetchMock.mockResolvedValue(errorResponse());

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(alertUpdate).not.toHaveBeenCalled();
    expect(sent).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('não deve vazar a chave do Resend no log de erro', async () => {
    seedFirestore();
    fetchMock.mockResolvedValue(
      errorResponse(401, 'API key re_chave_secreta is invalid'),
    );

    await sendAlertEmails('user-1', [alert()]);

    const logged = (console.error as jest.Mock).mock.calls
      .flat()
      .map((entry) => JSON.stringify(entry))
      .join(' ');
    expect(logged).not.toContain('re_chave_secreta');
    expect(logged).toContain('[redacted]');
  });

  it('deve pular o envio quando a RESEND_API_KEY não está configurada', async () => {
    seedFirestore();
    delete process.env.RESEND_API_KEY;

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sent).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('deve pular o envio quando o usuário não tem e-mail no Auth', async () => {
    seedFirestore();
    getUserMock.mockResolvedValue({ email: undefined });

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sent).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('deve pular o envio quando o usuário não existe mais no Auth', async () => {
    seedFirestore();
    getUserMock.mockRejectedValue(new Error('user not found'));

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('não deve consultar o Auth quando não há alerta a notificar', async () => {
    seedFirestore();

    const sent = await sendAlertEmails('user-1', []);

    expect(getUserMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('deve seguir com os demais alertas quando um envio falha', async () => {
    seedFirestore();
    fetchMock
      .mockResolvedValueOnce(errorResponse(500, 'oops'))
      .mockResolvedValue(okResponse());

    const sent = await sendAlertEmails('user-1', [
      alert(),
      alert({ id: 'fridge-1_MXRF11', ticker: 'MXRF11' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent).toBe(1);
  });

  it('deve abortar a requisição que passa do timeout', async () => {
    seedFirestore();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBeDefined();
      return Promise.reject(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      );
    });

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(sent).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});
