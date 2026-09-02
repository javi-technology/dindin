import {
  User,
  Wallet,
  Position,
  Fridge,
  FridgeItem,
  AssetType,
  Asset,
  Dividend,
  PatrimonySnapshot,
} from 'dindin-models';

// ---------------------------------------------------------------------------
// Testes de contrato dos models (issue #7)
// Valida que os models exportados possuem os campos obrigatórios esperados
// e que objetos válidos são aceitos pelo compilador TypeScript.
// ---------------------------------------------------------------------------

describe('models – User', () => {
  it('deve aceitar um objeto User válido', () => {
    const user: User = {
      uid: 'user-1',
      email: 'a@b.com',
      displayName: 'Fulano',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(user.uid).toBe('user-1');
    expect(user.email).toBe('a@b.com');
  });

  it('deve aceitar photoURL opcional', () => {
    const user: User = {
      uid: 'user-2',
      email: 'b@c.com',
      displayName: 'Ciclano',
      photoURL: 'https://example.com/photo.jpg',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(user.photoURL).toBeDefined();
  });
});

describe('models – Wallet', () => {
  it('deve aceitar um objeto Wallet válido', () => {
    const wallet: Wallet = {
      id: 'wallet-1',
      ownerId: 'user-1',
      name: 'Carteira Principal',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(wallet.currency).toBe('BRL');
  });
});

describe('models – Position', () => {
  it('deve aceitar um objeto Position válido com AssetType FII', () => {
    const position: Position = {
      id: 'pos-1',
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: 150.5,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(position.ticker).toBe('HGLG11');
    expect(position.assetType).toBe('FII');
    expect(position.inFridge).toBe(false);
  });

  it('deve aceitar Position na geladeira com targetPrice', () => {
    const position: Position = {
      id: 'pos-2',
      walletId: 'wallet-1',
      ticker: 'KNRI11',
      assetType: 'FII',
      quantity: 5,
      averagePrice: 130,
      inFridge: true,
      targetPrice: 120,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(position.inFridge).toBe(true);
    expect(position.targetPrice).toBe(120);
  });

  it('deve aceitar targetPrice opcional (undefined quando não está na geladeira)', () => {
    const position: Position = {
      id: 'pos-3',
      walletId: 'wallet-1',
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 100,
      averagePrice: 10,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(position.targetPrice).toBeUndefined();
  });

  it('deve aceitar todos os AssetTypes válidos', () => {
    const assertAssetType = (value: AssetType): AssetType => value;

    const types: AssetType[] = [
      assertAssetType('FII'),
      assertAssetType('STOCK'),
      assertAssetType('ETF'),
      assertAssetType('REIT'),
      assertAssetType('OTHER'),
    ];

    expect(types).toHaveLength(5);
  });
});

describe('models – Fridge', () => {
  it('deve aceitar um objeto Fridge válido', () => {
    const fridge: Fridge = {
      id: 'fridge-1',
      ownerId: 'user-1',
      name: 'Minha Geladeira',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(fridge.name).toBe('Minha Geladeira');
  });
});

describe('models – FridgeItem', () => {
  it('deve aceitar um objeto FridgeItem válido', () => {
    const item: FridgeItem = {
      id: 'item-1',
      fridgeId: 'fridge-1',
      ticker: 'XPML11',
      assetType: 'FII',
      targetPrice: 100.0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(item.ticker).toBe('XPML11');
    expect(item.targetPrice).toBe(100.0);
  });
});

describe('models – Asset', () => {
  it('deve aceitar um objeto Asset válido', () => {
    const asset: Asset = {
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      assetType: 'FII',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(asset.ticker).toBe('HGLG11');
    expect(asset.active).toBe(true);
  });
});

describe('models – Dividend', () => {
  it('deve aceitar um objeto Dividend válido', () => {
    const dividend: Dividend = {
      id: 'div-1',
      userId: 'user-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      amountPerShare: 0.82,
      quantity: 100,
      totalAmount: 82,
      paymentDate: '2026-01-15',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(dividend.ticker).toBe('HGLG11');
    expect(dividend.amountPerShare).toBe(0.82);
    expect(dividend.totalAmount).toBe(82);
  });

  it('deve aceitar assetType opcional', () => {
    const dividend: Dividend = {
      id: 'div-2',
      userId: 'user-1',
      ticker: 'MXRF11',
      amountPerShare: 0.1,
      quantity: 500,
      totalAmount: 50,
      paymentDate: '2026-02-10',
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    };
    expect(dividend.assetType).toBeUndefined();
  });
});

describe('models – PatrimonySnapshot', () => {
  it('deve aceitar um snapshot diário de patrimônio válido', () => {
    const snapshot: PatrimonySnapshot = {
      id: '2026-08-27',
      userId: 'user-1',
      date: '2026-08-27',
      totalWallet: 1000,
      totalFridge: 250,
      total: 1250,
      createdAt: '2026-08-27T00:00:00Z',
    };

    expect(snapshot.id).toBe(snapshot.date);
    expect(snapshot.total).toBe(snapshot.totalWallet + snapshot.totalFridge);
  });
});
