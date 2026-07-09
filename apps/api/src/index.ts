import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Request, Response } from "express";

admin.initializeApp();

const app = express();

app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", project: "dindin" });
});

export const api = functions.https.onRequest(app);
