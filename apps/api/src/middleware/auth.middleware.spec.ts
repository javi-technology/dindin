import { Request, Response, NextFunction } from "express";
import { authMiddleware, AuthRequest } from "./auth.middleware";

const verifyIdTokenMock = jest.fn();
jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

describe("AuthMiddleware", () => {
  let req: AuthRequest;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} } as AuthRequest;
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    verifyIdTokenMock.mockReset();
  });

  it("deve rejeitar requisição sem header Authorization", async () => {
    await authMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("deve rejeitar requisição com token malformado", async () => {
    req.headers = { authorization: "TokenInvalido" };

    await authMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("deve rejeitar requisição com token inválido", async () => {
    req.headers = { authorization: "Bearer token-invalido" };
    verifyIdTokenMock.mockRejectedValue(new Error("invalid token"));

    await authMiddleware(req, res as Response, next);

    expect(verifyIdTokenMock).toHaveBeenCalledWith("token-invalido");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("deve permitir requisição com token válido e anexar uid", async () => {
    req.headers = { authorization: "Bearer token-valido" };
    verifyIdTokenMock.mockResolvedValue({ uid: "user-123" });

    await authMiddleware(req, res as Response, next);

    expect(verifyIdTokenMock).toHaveBeenCalledWith("token-valido");
    expect(req.user).toEqual({ uid: "user-123" });
    expect(next).toHaveBeenCalled();
  });
});
