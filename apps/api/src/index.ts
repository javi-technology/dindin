import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import { authMiddleware, AuthRequest } from "./middleware/auth.middleware";
import {
  createWallet,
  deleteWallet,
  getWallet,
  listWallets,
  updateWallet,
} from "./wallet/wallet.controller";

admin.initializeApp();

const app = express();
app.use(express.json());

app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", project: "dindin" });
});

app.use("/api/*", authMiddleware);

app.get("/api/me", (req: AuthRequest, res: Response) => {
  res.json({ uid: req.user?.uid });
});

app.get("/api/wallets", listWallets);
app.post("/api/wallets", createWallet);
app.get("/api/wallets/:id", getWallet);
app.put("/api/wallets/:id", updateWallet);
app.delete("/api/wallets/:id", deleteWallet);

export const api = functions.https.onRequest(app);
export { app };
