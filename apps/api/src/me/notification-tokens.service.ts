import { DeviceToken, DevicePlatform, isDevicePlatform } from 'dindin-models';

import { deviceTokensCollection } from '../firestore/paths';
import { HttpError } from '../shared/http-error';

/**
 * Tokens de notificação por usuário e aparelho (issue #408).
 *
 * O token muda quando o usuário reinstala o app, troca de aparelho ou limpa
 * os dados, e um usuário pode ter mais de um aparelho. Guardar por token, e
 * não por usuário, é o que permite avisar o celular e o tablet — e descartar
 * só o que deixou de valer.
 */

export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: DevicePlatform,
  now = new Date(),
): Promise<void> {
  const limpo = token.trim();
  if (!limpo) throw HttpError.badRequest('Token de notificação é obrigatório');
  if (!isDevicePlatform(platform)) {
    throw HttpError.badRequest('Plataforma não suportada');
  }

  const timestamp = now.toISOString();
  const documento = deviceTokensCollection(userId).doc(limpo);
  const atual = await documento.get();

  // O `createdAt` do primeiro registro deste aparelho é preservado: o app
  // registra o token a cada abertura, e mandá-lo no merge zeraria a contagem
  // de há quanto tempo o aparelho está cadastrado.
  await documento.set(
    {
      token: limpo,
      platform,
      createdAt: atual.exists
        ? ((atual.data() as { createdAt?: string }).createdAt ?? timestamp)
        : timestamp,
      updatedAt: timestamp,
    },
    { merge: true },
  );
}

/**
 * Remove o token.
 *
 * É como o usuário desliga as notificações dentro do app, sem depender das
 * configurações do sistema — e é também o que o envio faz com o token que a
 * plataforma recusou.
 */
export async function removeDeviceToken(
  userId: string,
  token: string,
): Promise<void> {
  await deviceTokensCollection(userId).doc(token.trim()).delete();
}

export async function listDeviceTokens(userId: string): Promise<DeviceToken[]> {
  const snapshot = await deviceTokensCollection(userId).get();

  return snapshot.docs.map((doc) => doc.data() as DeviceToken);
}
