let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import {
  listDeviceTokens,
  registerDeviceToken,
  removeDeviceToken,
} from '../../src/me/notification-tokens.service';

// ---------------------------------------------------------------------------
// Tokens de notificação por usuário e aparelho (issue #408)
//
// O token muda quando o usuário reinstala o app, troca de aparelho ou limpa
// os dados, e um usuário pode ter mais de um aparelho. Guardá-lo por token,
// e não por usuário, é o que permite avisar o celular e o tablet — e
// descartar só o que deixou de valer.
// ---------------------------------------------------------------------------

function seed(existentes: Record<string, unknown> = {}) {
  const gravados: Record<string, unknown> = { ...existentes };
  const apagados: string[] = [];

  const doc = jest.fn((id: string) => ({
    get: jest.fn(async () => ({
      exists: id in gravados,
      data: () => gravados[id],
    })),
    set: jest.fn(async (dados: unknown, opcoes?: unknown) => {
      gravados[id] =
        opcoes && (opcoes as { merge?: boolean }).merge
          ? { ...(gravados[id] as object), ...(dados as object) }
          : dados;
    }),
    delete: jest.fn(async () => {
      apagados.push(id);
      delete gravados[id];
    }),
  }));

  firestoreMock = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn((sub: string) => {
          if (sub !== 'deviceTokens') {
            throw new Error(`Coleção inesperada: ${sub}`);
          }
          return {
            doc,
            get: jest.fn(async () => ({
              docs: Object.entries(gravados).map(([id, data]) => ({
                id,
                data: () => data,
              })),
            })),
          };
        }),
      })),
    })),
  };

  return { gravados, apagados, doc };
}

describe('tokens de notificação', () => {
  const agora = new Date('2026-09-19T10:00:00Z');

  beforeEach(() => jest.clearAllMocks());

  describe('registro', () => {
    it('deve guardar o token com a plataforma de origem', async () => {
      const { gravados } = seed();

      await registerDeviceToken('user-1', 'token-1', 'android', agora);

      expect(gravados['token-1']).toMatchObject({
        token: 'token-1',
        platform: 'android',
        updatedAt: '2026-09-19T10:00:00.000Z',
      });
    });

    it('deve permitir mais de um aparelho por usuário', async () => {
      const { gravados } = seed();

      await registerDeviceToken('user-1', 'token-1', 'android', agora);
      await registerDeviceToken('user-1', 'token-2', 'ios', agora);

      expect(Object.keys(gravados)).toEqual(['token-1', 'token-2']);
    });

    // O app registra o token a cada abertura; criar um documento novo a cada
    // vez encheria a coleção de duplicatas do mesmo aparelho.
    it('deve atualizar o token já registrado em vez de duplicar', async () => {
      const { gravados } = seed({
        'token-1': {
          token: 'token-1',
          platform: 'android',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      });

      await registerDeviceToken('user-1', 'token-1', 'android', agora);

      expect(Object.keys(gravados)).toHaveLength(1);
      expect(gravados['token-1']).toMatchObject({
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-19T10:00:00.000Z',
      });
    });

    it('deve recusar plataforma fora das suportadas', async () => {
      seed();

      await expect(
        registerDeviceToken('user-1', 'token-1', 'palm' as never, agora),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('deve recusar token vazio', async () => {
      seed();

      await expect(
        registerDeviceToken('user-1', '  ', 'android', agora),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('remoção', () => {
    // É como o usuário desliga as notificações dentro do app, sem depender
    // das configurações do sistema.
    it('deve apagar o token', async () => {
      const { apagados } = seed({ 'token-1': { token: 'token-1' } });

      await removeDeviceToken('user-1', 'token-1');

      expect(apagados).toEqual(['token-1']);
    });

    it('deve aceitar remover token inexistente', async () => {
      seed();

      await expect(
        removeDeviceToken('user-1', 'token-9'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listagem', () => {
    it('deve devolver os tokens do usuário', async () => {
      seed({
        'token-1': {
          token: 'token-1',
          platform: 'android',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      });

      const tokens = await listDeviceTokens('user-1');

      expect(tokens).toHaveLength(1);
      expect(tokens[0].platform).toBe('android');
    });

    it('deve devolver vazio para quem não registrou nenhum', async () => {
      seed();

      expect(await listDeviceTokens('user-1')).toEqual([]);
    });
  });
});
