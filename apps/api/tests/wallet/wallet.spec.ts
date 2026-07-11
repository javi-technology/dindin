import request from "supertest";

const verifyIdTokenMock = jest.fn();

let firestoreMock: any;

jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
  firestore: jest.fn(() => firestoreMock),
}));

import { app } from "../../src/index";

interface WalletData {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

function createWalletSnapshot(wallet: WalletData) {
  return {
    id: wallet.id,
    exists: true,
    data: () => ({ ...wallet }),
  };
}

function createFirestoreMock(wallets: WalletData[] = []) {
  const walletMap = new Map<string, any>();

  wallets.forEach((wallet) => {
    let data = { ...wallet };
    walletMap.set(wallet.id, {
      get: jest
        .fn()
        .mockImplementation(() => Promise.resolve(createWalletSnapshot(data))),
      set: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      update: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    });
  });

  function getWalletsSnapshot() {
    return {
      docs: wallets.map((wallet) => createWalletSnapshot(wallet)),
      empty: wallets.length === 0,
      forEach: (callback: any) => {
        wallets.forEach((wallet) => callback(createWalletSnapshot(wallet)));
      },
    };
  }

  const walletsCollection = {
    doc: jest.fn((id: string) => {
      if (!walletMap.has(id)) {
        return {
          id,
          exists: false,
          data: () => null,
          get: jest
            .fn()
            .mockResolvedValue({ id, exists: false, data: () => null }),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest
            .fn()
            .mockRejectedValue(new Error("Document does not exist")),
          delete: jest
            .fn()
            .mockRejectedValue(new Error("Document does not exist")),
        };
      }
      return walletMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: "new-wallet-id" }),
    get: jest.fn().mockResolvedValue(getWalletsSnapshot()),
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === "users") {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === "wallets" && uid === "user-123")
                return walletsCollection;
              throw new Error(`Unexpected subcollection: ${subPath}`);
            }),
          })),
        };
      }
      throw new Error(`Unexpected collection: ${path}`);
    }),
  };
}

describe("Wallet CRUD", () => {
  const authHeader = "Bearer valid-token";
  const baseWallet: WalletData = {
    id: "wallet-1",
    ownerId: "user-123",
    name: "Carteira Principal",
    currency: "BRL",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: "user-123" });
  });

  describe("GET /api/wallets", () => {
    it("deve listar as carteiras do usuário autenticado", async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .get("/api/wallets")
        .set("Authorization", authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([baseWallet]);
    });

    it("deve retornar 401 sem token de autenticação", async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app).get("/api/wallets");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/wallets", () => {
    it("deve criar uma carteira com dados válidos", async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post("/api/wallets")
        .set("Authorization", authHeader)
        .send({ name: "Nova Carteira", currency: "BRL" });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe("new-wallet-id");
      expect(response.body.ownerId).toBe("user-123");
      expect(response.body.name).toBe("Nova Carteira");
      expect(response.body.currency).toBe("BRL");
      expect(firestoreMock.collection).toHaveBeenCalledWith("users");
    });

    it("deve retornar 400 quando name não é informado", async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post("/api/wallets")
        .set("Authorization", authHeader)
        .send({ currency: "BRL" });

      expect(response.status).toBe(400);
    });

    it("deve retornar 400 quando currency não é informado", async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post("/api/wallets")
        .set("Authorization", authHeader)
        .send({ name: "Nova Carteira" });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/wallets/:id", () => {
    it("deve retornar uma carteira existente", async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .get("/api/wallets/wallet-1")
        .set("Authorization", authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(baseWallet);
    });

    it("deve retornar 404 para carteira inexistente", async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .get("/api/wallets/inexistente")
        .set("Authorization", authHeader);

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/wallets/:id", () => {
    it("deve atualizar uma carteira existente", async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .put("/api/wallets/wallet-1")
        .set("Authorization", authHeader)
        .send({ name: "Carteira Atualizada" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Carteira Atualizada");
      expect(response.body.id).toBe("wallet-1");
    });

    it("deve retornar 404 para carteira inexistente", async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .put("/api/wallets/inexistente")
        .set("Authorization", authHeader)
        .send({ name: "Carteira Atualizada" });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/wallets/:id", () => {
    it("deve remover uma carteira existente", async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .delete("/api/wallets/wallet-1")
        .set("Authorization", authHeader);

      expect(response.status).toBe(204);
    });

    it("deve retornar 404 para carteira inexistente", async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .delete("/api/wallets/inexistente")
        .set("Authorization", authHeader);

      expect(response.status).toBe(404);
    });
  });
});
