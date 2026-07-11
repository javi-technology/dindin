import {
  User,
  Wallet,
  Position,
  Fridge,
  FridgeItem,
  AssetType,
} from "dindin-models";

// ---------------------------------------------------------------------------
// Testes de contrato dos models (issue #7)
// Valida que os models exportados possuem os campos obrigatórios esperados
// e que objetos válidos são aceitos pelo compilador TypeScript.
// ---------------------------------------------------------------------------

describe("models – User", () => {
  it("deve aceitar um objeto User válido", () => {
    const user: User = {
      uid: "user-1",
      email: "a@b.com",
      displayName: "Fulano",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(user.uid).toBe("user-1");
    expect(user.email).toBe("a@b.com");
  });

  it("deve aceitar photoURL opcional", () => {
    const user: User = {
      uid: "user-2",
      email: "b@c.com",
      displayName: "Ciclano",
      photoURL: "https://example.com/photo.jpg",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(user.photoURL).toBeDefined();
  });
});

describe("models – Wallet", () => {
  it("deve aceitar um objeto Wallet válido", () => {
    const wallet: Wallet = {
      id: "wallet-1",
      ownerId: "user-1",
      name: "Carteira Principal",
      currency: "BRL",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(wallet.currency).toBe("BRL");
  });
});

describe("models – Position", () => {
  it("deve aceitar um objeto Position válido com AssetType FII", () => {
    const position: Position = {
      id: "pos-1",
      walletId: "wallet-1",
      ticker: "HGLG11",
      assetType: "FII",
      quantity: 10,
      averagePrice: 150.5,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(position.ticker).toBe("HGLG11");
    expect(position.assetType).toBe("FII");
  });

  it("deve aceitar todos os AssetTypes válidos", () => {
    const assertAssetType = (value: AssetType): AssetType => value;

    const types: AssetType[] = [
      assertAssetType("FII"),
      assertAssetType("STOCK"),
      assertAssetType("ETF"),
      assertAssetType("REIT"),
      assertAssetType("OTHER"),
    ];

    expect(types).toHaveLength(5);
  });
});

describe("models – Fridge", () => {
  it("deve aceitar um objeto Fridge válido", () => {
    const fridge: Fridge = {
      id: "fridge-1",
      ownerId: "user-1",
      name: "Minha Geladeira",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(fridge.name).toBe("Minha Geladeira");
  });
});

describe("models – FridgeItem", () => {
  it("deve aceitar um objeto FridgeItem válido", () => {
    const item: FridgeItem = {
      id: "item-1",
      fridgeId: "fridge-1",
      ticker: "XPML11",
      assetType: "FII",
      targetPrice: 100.0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(item.ticker).toBe("XPML11");
    expect(item.targetPrice).toBe(100.0);
  });
});
