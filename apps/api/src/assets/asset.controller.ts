import { Request, Response } from 'express';
import * as admin from 'firebase-admin';

function assetsCollection() {
  return admin.firestore().collection('assets');
}

/**
 * Lista os ativos disponíveis no catálogo para seleção em posições/itens
 * da geladeira. Apenas ativos com `active: true` são retornados.
 */
export async function listAssets(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await assetsCollection().where('active', '==', true).get();
    const assets = snapshot.docs.map((doc) => doc.data());
    res.json(assets);
  } catch (error) {
    console.error('[listAssets] error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
