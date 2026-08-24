import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

/** Requisição com campo `user` opcional — antes do authMiddleware. */
export interface AuthRequest extends Request {
  user?: {
    uid: string;
  };
}

/** Requisição com campo `user` garantido — após o authMiddleware. */
export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
  };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
}
