import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { parseBody } from '../shared/validation';
import {
  assetSimulationSchema,
  walletSimulationSchema,
} from './simulation.validation';
import {
  listSimulationProviders,
  simulateAsset as simulateAssetForUser,
  simulateRecommendedWallet,
} from './simulation.service';

/**
 * Rotas da simulação (issue #396).
 *
 * A simulação por carteira sugerida é gratuita por decisão de produto: é a
 * porta de entrada da funcionalidade, e por isso ela não consulta entitlement
 * nem devolve `limited`. A simulação por ativo é paga, e o bloqueio é total:
 * o gate mora na rota (`requireEntitlement('projections')`), não aqui.
 */

export const listSimulationWallets = asyncHandler(
  'listSimulationWallets',
  async (_req: Request, res: Response) => {
    res.json(await listSimulationProviders());
  },
);

export const simulateWallet = asyncHandler(
  'simulateWallet',
  async (req: Request, res: Response) => {
    const parsed = parseBody(walletSimulationSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    res.json(await simulateRecommendedWallet(parsed.data));
  },
);

export const simulateAsset = asyncHandler(
  'simulateAsset',
  async (req: Request, res: Response) => {
    const parsed = parseBody(assetSimulationSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    res.json(await simulateAssetForUser(parsed.data));
  },
);
