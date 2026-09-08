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
import {
  generateSuggestion as generateSuggestionForUser,
  getSavedSuggestion,
} from './ai-suggestion.service';

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

function suggestionTab(value: unknown): 'renda' | 'ganho' {
  return value === 'ganho' ? 'ganho' : 'renda';
}

export async function getSuggestion(
  req: Request,
  res: Response,
): Promise<void> {
  const walletId =
    typeof req.query.walletId === 'string' ? req.query.walletId : undefined;
  const month =
    typeof req.query.month === 'string' ? req.query.month : undefined;
  if (!walletId || !month) {
    res.status(400).json({ error: 'walletId e month são obrigatórios' });
    return;
  }

  try {
    const suggestion = await getSavedSuggestion(
      uid(req),
      walletId,
      month,
      suggestionTab(req.query.tab),
    );
    if (!suggestion) {
      res.status(404).json({ error: 'Sugestão não encontrada' });
      return;
    }
    res.json(suggestion);
  } catch (error) {
    console.error('[getSuggestion] error:', error);
    const code = statusCode(error);
    res.status(code).json({
      error: code === 500 ? 'Internal server error' : (error as Error).message,
    });
  }
}

export async function generateSuggestion(
  req: Request,
  res: Response,
): Promise<void> {
  const { walletId, month, tab, contribution } = req.body as {
    walletId?: unknown;
    month?: unknown;
    tab?: unknown;
    contribution?: unknown;
  };
  if (
    typeof walletId !== 'string' ||
    typeof month !== 'string' ||
    (tab !== 'renda' && tab !== 'ganho')
  ) {
    res.status(400).json({ error: 'walletId, month e tab são obrigatórios' });
    return;
  }
  if (
    contribution !== undefined &&
    (typeof contribution !== 'number' ||
      !Number.isFinite(contribution) ||
      contribution < 0)
  ) {
    res.status(400).json({ error: 'contribution inválido' });
    return;
  }

  try {
    const force = req.query.force === 'true';
    const suggestion = await generateSuggestionForUser(
      uid(req),
      walletId,
      month,
      tab,
      force,
      contribution,
    );
    res.status(201).json(suggestion);
  } catch (error) {
    console.error('[generateSuggestion] error:', error);
    const code = statusCode(error);
    res.status(code).json({
      error: code === 500 ? 'Internal server error' : (error as Error).message,
    });
  }
}
