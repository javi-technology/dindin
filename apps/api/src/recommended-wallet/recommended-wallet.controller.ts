import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { HttpError } from '../shared/http-error';
import { uid } from '../firestore/paths';
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
import {
  AppliedItemInput,
  recordAppliedItem,
} from './suggestion-applied.service';

// O mapeamento de `error.statusCode` para status HTTP, antes repetido em seis
// handlers deste arquivo, passou para o asyncHandler (issue #222): basta
// deixar o erro subir com o statusCode que o serviço anexou.

function monthQuery(req: Request): string | undefined {
  return typeof req.query.month === 'string' ? req.query.month : undefined;
}

function suggestionTab(value: unknown): 'renda' | 'ganho' {
  return value === 'ganho' ? 'ganho' : 'renda';
}

export const listRecommended = asyncHandler(
  'listRecommended',
  async (_req: Request, res: Response) => {
    res.json(await listRecommendedWallets());
  },
);

export const getLatestRecommended = asyncHandler(
  'getLatestRecommended',
  async (req: Request, res: Response) => {
    const wallet = await getRecommendedWallet(monthQuery(req));

    if (!wallet) {
      res.status(404).json({ error: 'Carteira recomendada não encontrada' });
      return;
    }

    res.json(wallet);
  },
);

export const compareRecommended = asyncHandler(
  'compareRecommended',
  async (req: Request, res: Response) => {
    const selectedWallet = req.query.wallet === 'ganho' ? 'ganho' : 'renda';

    res.json(
      await compareWithWallet(
        uid(req),
        req.params.walletId,
        monthQuery(req),
        selectedWallet,
      ),
    );
  },
);

export const importRecommended = asyncHandler(
  'importRecommended',
  async (req: Request, res: Response) => {
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
      // Falha ao interpretar o PDF enviado é erro do cliente, não interno.
      throw HttpError.badRequest((error as Error).message, { cause: error });
    }

    const sourceFile = await saveBbPdf(fileName, buffer);
    res
      .status(201)
      .json(await persistRecommendedWallet({ ...wallet, sourceFile }));
  },
);

export const confirmRecommended = asyncHandler(
  'confirmRecommended',
  async (req: Request, res: Response) => {
    res.json(await confirmRecommendedWallet(req.params.id));
  },
);

export const getSuggestion = asyncHandler(
  'getSuggestion',
  async (req: Request, res: Response) => {
    const walletId =
      typeof req.query.walletId === 'string' ? req.query.walletId : undefined;
    const month = monthQuery(req);

    if (!walletId || !month) {
      res.status(400).json({ error: 'walletId e month são obrigatórios' });
      return;
    }

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
  },
);

export const generateSuggestion = asyncHandler(
  'generateSuggestion',
  async (req: Request, res: Response) => {
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

    const suggestion = await generateSuggestionForUser(
      uid(req),
      walletId,
      month,
      tab,
      req.query.force === 'true',
      contribution,
    );

    res.status(201).json(suggestion);
  },
);

/** Marca uma compra da sugestão como lançada na carteira (#276). */
export const applySuggestionItem = asyncHandler(
  'applySuggestionItem',
  async (req: Request, res: Response) => {
    res.json(
      await recordAppliedItem(
        uid(req),
        req.params.id,
        (req.body ?? {}) as AppliedItemInput,
      ),
    );
  },
);
