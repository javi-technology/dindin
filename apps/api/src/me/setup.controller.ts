import { Request, Response } from 'express';
import { DefaultResource, SetupRequest } from 'dindin-shared-types';
import { asyncHandler } from '../middleware/async-handler';
import { uid } from '../firestore/paths';
import { provisionDefaults } from './default-setup.service';

const RESOURCES: DefaultResource[] = ['wallet', 'fridge'];

/** `POST /api/me/setup`: provisiona carteira e geladeira padrão (#275). */
export const setupDefaults = asyncHandler(
  'setupDefaults',
  async (req: Request, res: Response) => {
    const { resource } = (req.body ?? {}) as SetupRequest;

    if (resource !== undefined && !RESOURCES.includes(resource)) {
      res.status(400).json({ error: 'Recurso inválido' });
      return;
    }

    res.json(await provisionDefaults(uid(req), resource));
  },
);
