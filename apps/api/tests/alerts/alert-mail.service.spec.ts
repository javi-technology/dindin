let firestoreMock: any;
const getUserMock = jest.fn();

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
  const mailSet = jest.fn().mockResolvedValue(undefined);
  const alertUpdate = jest.fn().mockResolvedValue(undefined);
  const mailDoc = jest.fn(() => ({ set: mailSet }));
  const alertDoc = jest.fn(() => ({ update: alertUpdate }));

  firestoreMock = {
    collection: jest.fn((name: string) => {
      if (name === 'mail') return { doc: mailDoc };
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

  return { mailSet, mailDoc, alertUpdate, alertDoc };
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
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMock.mockResolvedValue({ email: 'investidor@example.com' });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve gravar o e-mail na coleção mail com o id do alerta', async () => {
    const { mailSet, mailDoc } = seedFirestore();

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(mailDoc).toHaveBeenCalledWith('fridge-1_HGLG11');
    expect(mailSet).toHaveBeenCalledTimes(1);
    expect(sent).toBe(1);
  });

  it('deve endereçar o e-mail ao usuário do Firebase Auth', async () => {
    const { mailSet } = seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    expect(getUserMock).toHaveBeenCalledWith('user-1');
    expect(mailSet).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['investidor@example.com'] }),
    );
  });

  it('deve descrever ticker, preço atual, preço-alvo e geladeira no conteúdo', async () => {
    const { mailSet } = seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    const message = mailSet.mock.calls[0][0].message;
    expect(message.subject).toContain('HGLG11');
    expect(message.subject).toContain('R$ 120,00');
    expect(message.text).toContain('R$ 125,50');
    expect(message.text).toContain('Geladeira FIIs');
    expect(message.html).toContain('HGLG11');
    expect(message.html).toContain('R$ 125,50');
  });

  it('deve incluir o link do app no e-mail', async () => {
    const { mailSet } = seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    const message = mailSet.mock.calls[0][0].message;
    expect(message.text).toContain('https://dindin-4e720.web.app/geladeira');
    expect(message.html).toContain('https://dindin-4e720.web.app/geladeira');
  });

  it('deve marcar notifiedAt no alerta após enfileirar o e-mail', async () => {
    const { alertUpdate, alertDoc } = seedFirestore();

    await sendAlertEmails('user-1', [alert()]);

    expect(alertDoc).toHaveBeenCalledWith('fridge-1_HGLG11');
    expect(alertUpdate).toHaveBeenCalledWith({
      notifiedAt: expect.any(String),
    });
  });

  it('não deve reenviar alerta que já tem notifiedAt', async () => {
    const { mailSet, alertUpdate } = seedFirestore();

    const sent = await sendAlertEmails('user-1', [
      alert({ notifiedAt: '2026-09-18T22:16:00Z' }),
    ]);

    expect(mailSet).not.toHaveBeenCalled();
    expect(alertUpdate).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('deve pular o envio quando o usuário não tem e-mail no Auth', async () => {
    const { mailSet } = seedFirestore();
    getUserMock.mockResolvedValue({ email: undefined });

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(mailSet).not.toHaveBeenCalled();
    expect(sent).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('deve pular o envio quando o usuário não existe mais no Auth', async () => {
    const { mailSet } = seedFirestore();
    getUserMock.mockRejectedValue(new Error('user not found'));

    const sent = await sendAlertEmails('user-1', [alert()]);

    expect(mailSet).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('não deve consultar o Auth quando não há alerta a notificar', async () => {
    seedFirestore();

    const sent = await sendAlertEmails('user-1', []);

    expect(getUserMock).not.toHaveBeenCalled();
    expect(sent).toBe(0);
  });

  it('deve seguir com os demais alertas quando um envio falha', async () => {
    const { mailSet } = seedFirestore();
    mailSet.mockRejectedValueOnce(new Error('indisponível'));

    const sent = await sendAlertEmails('user-1', [
      alert(),
      alert({ id: 'fridge-1_MXRF11', ticker: 'MXRF11' }),
    ]);

    expect(mailSet).toHaveBeenCalledTimes(2);
    expect(sent).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });
});
