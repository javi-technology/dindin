const firebaseLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('firebase-functions/logger', () => firebaseLogger);

import { logError, logInfo, logWarn } from '../../src/shared/logger';

// ---------------------------------------------------------------------------
// Logger estruturado (issue #324)
//
// Os logs eram `console.log`/`console.error` com texto livre e conjuntos de
// campos diferentes em cada ponto, o que impede filtrar por rota, status ou
// uid no Cloud Logging. O logger do firebase-functions publica os campos como
// `jsonPayload`, que é consultável.
// ---------------------------------------------------------------------------

describe('shared/logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve publicar evento e campos estruturados', () => {
    logInfo('request', { method: 'GET', path: '/api/wallets', status: 200 });

    expect(firebaseLogger.info).toHaveBeenCalledWith('request', {
      method: 'GET',
      path: '/api/wallets',
      status: 200,
    });
  });

  it('deve encaminhar aviso e erro para o nível certo', () => {
    logWarn('billing.webhook', { reason: 'assinatura inválida' });
    logError('createWallet', { message: 'Firestore caiu' });

    expect(firebaseLogger.warn).toHaveBeenCalledWith('billing.webhook', {
      reason: 'assinatura inválida',
    });
    expect(firebaseLogger.error).toHaveBeenCalledWith('createWallet', {
      message: 'Firestore caiu',
    });
  });

  it('deve aceitar evento sem campos', () => {
    logInfo('updateQuotes.start');

    expect(firebaseLogger.info).toHaveBeenCalledWith('updateQuotes.start', {});
  });

  // O que trafega nas rotas é dado financeiro do usuário; método, rota e uid
  // bastam para localizar a falha sem despejar a carteira de alguém no log.
  it('deve descartar o corpo da requisição', () => {
    logError('createPosition', {
      uid: 'user-1',
      body: { ticker: 'HGLG11', quantity: 100 },
    });

    expect(firebaseLogger.error).toHaveBeenCalledWith('createPosition', {
      uid: 'user-1',
    });
  });
});
