import { Response } from "express";
import * as admin from "firebase-admin";
import { AuthRequest } from "../middleware/auth.middleware";

function walletsCollection(userId: string) {
  return admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("wallets");
}

export async function listWallets(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId = req.user!.uid;
  const snapshot = await walletsCollection(userId).get();
  const wallets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json(wallets);
}

export async function createWallet(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId = req.user!.uid;
  const { name, description, currency } = req.body;

  if (!name || !currency) {
    res.status(400).json({ error: "Name and currency are required" });
    return;
  }

  const now = new Date().toISOString();
  const walletData = {
    ownerId: userId,
    name,
    description: description ?? "",
    currency,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await walletsCollection(userId).add(walletData);
  res.status(201).json({ id: docRef.id, ...walletData });
}

export async function getWallet(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId = req.user!.uid;
  const walletId = req.params.id;
  const doc = await walletsCollection(userId).doc(walletId).get();

  if (!doc.exists) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  res.json({ id: doc.id, ...doc.data() });
}

export async function updateWallet(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId = req.user!.uid;
  const walletId = req.params.id;
  const walletRef = walletsCollection(userId).doc(walletId);
  const doc = await walletRef.get();

  if (!doc.exists) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const { name, description, currency } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };

  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (currency !== undefined) updates.currency = currency;

  await walletRef.update(updates);
  const updatedDoc = await walletRef.get();
  res.json({ id: updatedDoc.id, ...updatedDoc.data() });
}

export async function deleteWallet(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId = req.user!.uid;
  const walletId = req.params.id;
  const walletRef = walletsCollection(userId).doc(walletId);
  const doc = await walletRef.get();

  if (!doc.exists) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  await walletRef.delete();
  res.status(204).send();
}
