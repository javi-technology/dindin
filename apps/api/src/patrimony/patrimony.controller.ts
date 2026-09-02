import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  listPatrimonySnapshots,
  savePatrimonySnapshot,
} from './patrimony-snapshot.service';

const INVALID_LIMIT_ERROR = 'Limit must be an integer between 1 and 730';

function uid(req: Request): string {
  return (req as AuthRequest).user!.uid;
}

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

export async function getPatrimonyHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawLimit = req.query.limit;
    const limit = parseLimit(rawLimit);
    if (rawLimit !== undefined && limit === undefined) {
      res.status(400).json({ error: INVALID_LIMIT_ERROR });
      return;
    }

    const snapshots = await listPatrimonySnapshots(uid(req), limit);
    res.json(snapshots);
  } catch (error) {
    console.error('[getPatrimonyHistory] error:', {
      uid: uid(req),
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function postPatrimonySnapshot(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const snapshot = await savePatrimonySnapshot(uid(req));
    res.status(201).json(snapshot);
  } catch (error) {
    console.error('[postPatrimonySnapshot] error:', {
      uid: uid(req),
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
