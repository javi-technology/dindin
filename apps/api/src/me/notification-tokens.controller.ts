import { Response } from 'express';

import { DevicePlatform } from 'dindin-models';

import { asyncHandler } from '../middleware/async-handler';
import { AuthRequest } from '../middleware/auth.middleware';
import { uid } from '../firestore/paths';
import { HttpError } from '../shared/http-error';
import { routeParam } from '../shared/route-params';
import {
  registerDeviceToken,
  removeDeviceToken,
} from './notification-tokens.service';

/**
 * Registro e remoção do token de notificação do aparelho (issue #408).
 *
 * Remover é como o usuário desliga as notificações push **dentro do app**,
 * sem depender das configurações do sistema.
 */

export const postNotificationToken = asyncHandler(
  'postNotificationToken',
  async (req: AuthRequest, res: Response) => {
    const { token, platform } = req.body as {
      token?: unknown;
      platform?: unknown;
    };

    if (typeof token !== 'string') {
      throw HttpError.badRequest('Token de notificação é obrigatório');
    }

    await registerDeviceToken(uid(req), token, platform as DevicePlatform);

    res.status(204).send();
  },
);

export const deleteNotificationToken = asyncHandler(
  'deleteNotificationToken',
  async (req: AuthRequest, res: Response) => {
    await removeDeviceToken(uid(req), routeParam(req, 'token'));

    res.status(204).send();
  },
);
