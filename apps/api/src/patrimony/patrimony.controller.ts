import { Request, Response } from 'express';
import {
  listPatrimonySnapshots,
  savePatrimonySnapshot,
} from './patrimony-snapshot.service';
import { asyncHandler } from '../middleware/async-handler';
import { uid } from '../firestore/paths';

const INVALID_LIMIT_ERROR = 'Limit must be an integer between 1 and 730';

function parseLimit(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 730
    ? parsed
    : undefined;
}

export const getPatrimonyHistory = asyncHandler(
  'getPatrimonyHistory',
  async (req: Request, res: Response) => {
    const rawLimit = req.query.limit;
    const limit = parseLimit(rawLimit);
    if (rawLimit !== undefined && limit === undefined) {
      res.status(400).json({ error: INVALID_LIMIT_ERROR });
      return;
    }

    const snapshots = await listPatrimonySnapshots(uid(req), limit);
    res.json(snapshots);
  },
);

export const postPatrimonySnapshot = asyncHandler(
  'postPatrimonySnapshot',
  async (req: Request, res: Response) => {
    const snapshot = await savePatrimonySnapshot(uid(req));
    res.status(201).json(snapshot);
  },
);
