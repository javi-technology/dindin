import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import { authMiddleware, AuthRequest } from "./middleware/auth.middleware";

admin.initializeApp();

const app = express();

app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", project: "dindin" });
});

app.use("/api/*", authMiddleware);

app.get("/api/me", (req: AuthRequest, res: Response) => {
  res.json({ uid: req.user?.uid });
});

export const api = functions.https.onRequest(app);
export { app };
