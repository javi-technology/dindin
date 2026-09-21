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
  aiSuggestionUsageCollection,
  aiSuggestionsCollection,
  alertsCollection,
  assetsCollection,
  billingEventsCollection,
  dividendsCollection,
  fridgeItemsCollection,
  fridgesCollection,
  patrimonySnapshotsCollection,
  positionsCollection,
  quoteDividendHistoryCollection,
  quoteHistoryCollection,
  quotesCollection,
  recommendedWalletsCollection,
  subscriptionDocument,
  uid,
  usersCollection,
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

  // ---------------------------------------------------------------------
  // Coleções que ficavam fora do módulo (issue #302)
  // ---------------------------------------------------------------------

  describe('coleções do usuário que faltavam', () => {
    it('deve montar users/{uid}/aiSuggestions', () => {
      aiSuggestionsCollection('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:aiSuggestions',
      ]);
    });

    it('deve montar users/{uid}/aiSuggestionUsage', () => {
      aiSuggestionUsageCollection('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:aiSuggestionUsage',
      ]);
    });

    it('deve montar users/{uid}/billing/subscription', () => {
      subscriptionDocument('user-123');

      expect(visited).toEqual([
        'collection:users',
        'doc:user-123',
        'collection:billing',
        'doc:subscription',
      ]);
    });
  });

  describe('coleções de topo', () => {
    it('deve montar users', () => {
      usersCollection();

      expect(visited).toEqual(['collection:users']);
    });

    it('deve montar assets', () => {
      assetsCollection();

      expect(visited).toEqual(['collection:assets']);
    });

    it('deve montar quotes', () => {
      quotesCollection();

      expect(visited).toEqual(['collection:quotes']);
    });

    it('deve montar quotes/{ticker}/history', () => {
      quoteHistoryCollection('HGLG11');

      expect(visited).toEqual([
        'collection:quotes',
        'doc:HGLG11',
        'collection:history',
      ]);
    });

    it('deve montar quotes/{ticker}/dividendHistory', () => {
      quoteDividendHistoryCollection('HGLG11');

      expect(visited).toEqual([
        'collection:quotes',
        'doc:HGLG11',
        'collection:dividendHistory',
      ]);
    });

    it('deve montar recommendedWallets', () => {
      recommendedWalletsCollection();

      expect(visited).toEqual(['collection:recommendedWallets']);
    });

    it('deve montar billingEvents', () => {
      billingEventsCollection();

      expect(visited).toEqual(['collection:billingEvents']);
    });
  });
});
