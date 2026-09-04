import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { parseBbFileName } from './bb-pdf.parser';
import { saveBbPdf } from './storage.service';
import {
  buildRecommendedWallet,
  compareWithWallet,
  confirmRecommendedWallet,
  getRecommendedWallet,
  listRecommendedWallets,
  persistRecommendedWallet,
} from './recommended-wallet.service';

function uid(req: Request): string {
  return (req as AuthRequest).user!.uid;
}

function statusCode(error: unknown): number {
  return typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ? (error as { statusCode: number }).statusCode
    : 500;
}

export async function listRecommended(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json(await listRecommendedWallets());
  } catch (error) {
    console.error('[listRecommended] error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getLatestRecommended(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const wallet = await getRecommendedWallet(
      typeof req.query.month === 'string' ? req.query.month : undefined,
    );
    if (!wallet) {
      res.status(404).json({ error: 'Carteira recomendada não encontrada' });
      return;
    }
    res.json(wallet);
  } catch (error) {
    console.error('[getLatestRecommended] error:', error);
    const code = statusCode(error);
    res.status(code).json({
      error: code === 500 ? 'Internal server error' : (error as Error).message,
    });
  }
}

export async function compareRecommended(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const selectedWallet = req.query.wallet === 'ganho' ? 'ganho' : 'renda';
    res.json(
      await compareWithWallet(
        uid(req),
        req.params.walletId,
        typeof req.query.month === 'string' ? req.query.month : undefined,
        selectedWallet,
      ),
    );
  } catch (error) {
    console.error('[compareRecommended] error:', error);
    const code = statusCode(error);
    res.status(code).json({
      error: code === 500 ? 'Internal server error' : (error as Error).message,
    });
  }
}

export async function importRecommended(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { fileName, contentBase64 } = req.body as {
      fileName?: unknown;
      contentBase64?: unknown;
    };
    if (
      typeof fileName !== 'string' ||
      typeof contentBase64 !== 'string' ||
      !parseBbFileName(fileName)
    ) {
      res.status(400).json({ error: 'fileName ou conteúdo inválido' });
      return;
    }
    const buffer = Buffer.from(contentBase64, 'base64');
    let wallet;
    try {
      wallet = await buildRecommendedWallet(
        buffer,
        `wallets/fii-bb/${fileName}`,
      );
    } catch (error) {
      const inputError = error as Error & { statusCode?: number };
      inputError.statusCode = 400;
      throw inputError;
    }
    const sourceFile = await saveBbPdf(fileName, buffer);
    res
      .status(201)
      .json(await persistRecommendedWallet({ ...wallet, sourceFile }));
  } catch (error) {
    console.error('[importRecommended] error:', error);
    const code = statusCode(error);
    res.status(code).json({
      error: code === 500 ? 'Internal server error' : (error as Error).message,
    });
  }
}

export async function confirmRecommended(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json(await confirmRecommendedWallet(req.params.id));
  } catch (error) {
    console.error('[confirmRecommended] error:', error);
    const code = statusCode(error);
    res.status(code).json({
      error: code === 500 ? 'Internal server error' : (error as Error).message,
    });
  }
}
