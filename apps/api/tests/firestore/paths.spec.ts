import { Request } from 'express';

// ---------------------------------------------------------------------------
// Testes dos caminhos do Firestore (issue #222)
// Antes, `users/...` era remontado à mão em 19 pontos e `positionsCollection`
// existia idêntica em três controllers. Uma divergência de string entre
// arquivos apontaria para a coleção errada sem erro de compilação.
// ---------------------------------------------------------------------------

/** Registra a cadeia de chamadas para conferir o caminho montado. */
let visited: string[];

function createCollection(): unknown {
  return {
    doc: jest.fn((id: string) => {
      visited.push(`doc:${id}`);
      return {
        collection: jest.fn((name: string) => {
          visited.push(`collection:${name}`);
          return createCollection();
        }),
      };
    }),
  };
}

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      visited.push(`collection:${name}`);
      return createCollection();
    }),
  })),
}));

import {
  alertsCollection,
  dividendsCollection,
  fridgeItemsCollection,
  fridgesCollection,
  patrimonySnapshotsCollection,
  positionsCollection,
  uid,
  walletsCollection,
} from '../../src/firestore/paths';

describe('caminhos do Firestore', () => {
  beforeEach(() => {
    visited = [];
  });

  describe('uid', () => {
    it('deve retornar o uid do usuário autenticado', () => {
      const req = { user: { uid: 'user-123' } } as unknown as Request;

      expect(uid(req)).toBe('user-123');
    });
  });

  describe('coleções', () => {
    it('deve montar users/{uid}/wallets', () => {
      walletsCollection('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:wallets',
      ]);
    });

    it('deve montar users/{uid}/wallets/{walletId}/positions', () => {
      positionsCollection('user-123', 'wallet-1');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:wallets',
        'doc:wallet-1',
        'collection:positions',
      ]);
    });

    it('deve montar users/{uid}/fridges', () => {
      fridgesCollection('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:fridges',
      ]);
    });

    it('deve montar users/{uid}/fridges/{fridgeId}/fridgeItems', () => {
      fridgeItemsCollection('user-123', 'fridge-1');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:fridges',
        'doc:fridge-1',
        'collection:fridgeItems',
      ]);
    });

    it('deve montar users/{uid}/alerts', () => {
      alertsCollection('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:alerts',
      ]);
    });

    it('deve montar users/{uid}/dividends', () => {
      dividendsCollection('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:dividends',
      ]);
    });

    it('deve montar users/{uid}/patrimonySnapshots', () => {
      patrimonySnapshotsCollection('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:patrimonySnapshots',
      ]);
    });
  });
});
