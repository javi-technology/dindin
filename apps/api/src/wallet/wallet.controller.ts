import { Response } from "express";
import * as admin from "firebase-admin";
import { Wallet } from "dindin-models";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

// Códigos de moeda ISO 4217 aceitos pela aplicação.
// Ampliar conforme necessário.
const SUPPORTED_CURRENCIES = new Set([
  "BRL",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "ARS",
]);

function walletsCollection(userId: string) {
  return admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("wallets");
}

export async function listWallets(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const snapshot = await walletsCollection(req.user.uid).get();
    const wallets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(wallets);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function createWallet(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const { name, description, currency } = req.body as Partial<Wallet>;

    if (!name || !currency) {
      res.status(400).json({ error: "Name and currency are required" });
      return;
    }

    if (!SUPPORTED_CURRENCIES.has(currency)) {
      res.status(400).json({
        error: `Currency '${currency}' is not supported. Accepted values: ${[...SUPPORTED_CURRENCIES].join(", ")}`,
      });
      return;
    }

    const now = new Date().toISOString();
    const walletData: Omit<Wallet, "id"> = {
      ownerId: req.user.uid,
      name,
      description: description ?? "",
      currency,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await walletsCollection(req.user.uid).add(walletData);
    res.status(201).json({ id: docRef.id, ...walletData });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getWallet(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const walletId = req.params.id;
    const doc = await walletsCollection(req.user.uid).doc(walletId).get();

    if (!doc.exists) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateWallet(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const walletId = req.params.id;
    const walletRef = walletsCollection(req.user.uid).doc(walletId);
    const doc = await walletRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const { name, description, currency } = req.body as Partial<
      Pick<Wallet, "name" | "description" | "currency">
    >;

    if (currency !== undefined && !SUPPORTED_CURRENCIES.has(currency)) {
      res.status(400).json({
        error: `Currency '${currency}' is not supported. Accepted values: ${[...SUPPORTED_CURRENCIES].join(", ")}`,
      });
      return;
    }

    const updatedAt = new Date().toISOString();
    const updates: Partial<Wallet> & { updatedAt: string } = { updatedAt };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (currency !== undefined) updates.currency = currency;

    await walletRef.update(updates);

    // Mescla em memória para evitar segunda leitura no Firestore
    const updatedWallet = { id: walletId, ...doc.data(), ...updates };
    res.json(updatedWallet);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteWallet(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const walletId = req.params.id;
    const walletRef = walletsCollection(req.user.uid).doc(walletId);
    const doc = await walletRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    // TODO(#10): remover sub-coleção positions/{positionId} antes de deletar a carteira
    // O Firestore não apaga documentos filhos automaticamente; use batch delete ou
    // uma Cloud Function acionada por onDelete para evitar dados órfãos.
    await walletRef.delete();
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
