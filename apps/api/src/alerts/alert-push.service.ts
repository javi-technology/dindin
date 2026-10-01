import { SendResult } from './send-result';
import { Alert, DeviceToken } from 'dindin-models';
import { getMessaging } from 'firebase-admin/messaging';

import { alertsCollection } from '../firestore/paths';
import { logError, logInfo, logWarn } from '../shared/logger';
import {
  listDeviceTokens,
  removeDeviceToken,
} from '../me/notification-tokens.service';

/**
 * Notificação push do alerta de preço-alvo (issue #408).
 *
 * O aviso é sobre oportunidade de compra a um preço-alvo, então chegar tarde
 * reduz o valor do alerta — é justamente o caso em que push se justifica
 * sobre o e-mail que o usuário lê horas depois.
 *
 * O e-mail continua sendo o canal para quem não tem token válido ou negou a
 * permissão, que é estado normal e não erro.
 */

/**
 * Códigos que significam que o token não vale mais.
 *
 * O token muda quando o usuário reinstala o app, troca de aparelho ou limpa
 * os dados. Sem descartá-lo, o job acumula falhas para sempre; descartar por
 * falha temporária, por outro lado, desligaria o push de quem só pegou o FCM
 * fora do ar.
 */
const CODIGOS_DE_TOKEN_INVALIDO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Envia um push por alerta ainda não notificado nesse canal.
 *
 * Devolve quantos alertas foram avisados e quantos falharam (ver
 * `SendResult`): o job precisa da contagem para falhar e acionar o retry. O
 * estado é gravado em
 * `notifiedPushAt`, separado do e-mail: com um único campo, o push que
 * falhasse depois de o e-mail ter ido provocaria reenvio do e-mail, e o
 * e-mail que falhasse depois do push marcaria o alerta como avisado sem ele
 * ter saído.
 */
export async function sendAlertPushes(
  userId: string,
  alerts: Alert[],
  now = new Date(),
): Promise<SendResult> {
  const pending = alerts.filter((alert) => !alert.notifiedPushAt);
  if (pending.length === 0) return { sent: 0, failed: 0 };

  const tokens = await listDeviceTokens(userId);
  if (tokens.length === 0) {
    // Sem aparelho registrado — permissão negada ou app não instalado. Não é
    // falha: o e-mail cobre esse usuário.
    logInfo('sendAlertPushes.noTokens', {
      uid: userId,
      pending: pending.length,
    });
    return { sent: 0, failed: 0 };
  }

  const userAlerts = alertsCollection(userId);
  const notifiedPushAt = now.toISOString();
  let sent = 0;
  let failed = 0;

  for (const alert of pending) {
    try {
      const resposta = await getMessaging().sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        notification: {
          // A notificação aparece na tela bloqueada: o ativo e o fato bastam.
          // Valor da carteira e preço ficam de fora — quem pegar o celular na
          // mesa não precisa vê-los.
          title: `${alert.ticker} atingiu o preço-alvo`,
          body: `O preço-alvo que você definiu em ${alert.fridgeName} foi atingido.`,
        },
        // Tocar na notificação abre a geladeira correspondente; sem o id, o
        // app só conseguiria abrir a tela inicial.
        data: {
          tipo: 'alerta-preco-alvo',
          fridgeId: alert.fridgeId,
          ticker: alert.ticker,
        },
      });

      await descartarTokensInvalidos(userId, tokens, resposta);

      if (resposta.successCount > 0) {
        await userAlerts.doc(alert.id).update({ notifiedPushAt });
        sent += 1;
      } else if (temFalhaTemporaria(resposta)) {
        // O FCM respondeu, mas nenhum aparelho recebeu e o motivo não foi
        // token inválido: o alerta segue sem push e vale tentar de novo.
        // Só token inválido não conta, porque já foi descartado e o e-mail
        // cobre o usuário.
        failed += 1;
      }
    } catch (error) {
      // Uma falha de envio não pode impedir o aviso dos demais ativos, nem
      // afetar o e-mail: o canal é registrado por conta própria. É contada,
      // porque é ela que faz o job falhar e acionar o retry.
      failed += 1;
      logError('sendAlertPushes.sendFailed', {
        uid: userId,
        ticker: alert.ticker,
        message: (error as Error).message,
      });
    }
  }

  logInfo('sendAlertPushes.done', {
    uid: userId,
    pending: pending.length,
    sent,
    failed,
    devices: tokens.length,
  });

  return { sent, failed };
}

/** Alguma resposta falhou por motivo que não é token inválido. */
function temFalhaTemporaria(resposta: {
  responses: { success: boolean; error?: { code?: string } }[];
}): boolean {
  return resposta.responses.some(
    (resultado) =>
      !resultado.success &&
      !CODIGOS_DE_TOKEN_INVALIDO.has(resultado.error?.code ?? ''),
  );
}

/** Apaga os tokens que a plataforma recusou por não valerem mais. */
async function descartarTokensInvalidos(
  userId: string,
  tokens: DeviceToken[],
  resposta: {
    responses: { success: boolean; error?: { code?: string } }[];
  },
): Promise<void> {
  const invalidos = resposta.responses
    .map((resultado, i) => ({ resultado, aparelho: tokens[i] }))
    .filter(
      ({ resultado, aparelho }) =>
        aparelho !== undefined &&
        !resultado.success &&
        CODIGOS_DE_TOKEN_INVALIDO.has(resultado.error?.code ?? ''),
    );

  for (const { aparelho } of invalidos) {
    await removeDeviceToken(userId, aparelho.token);
    logWarn('sendAlertPushes.tokenDescartado', {
      uid: userId,
      // O token não entra no log: é o identificador do aparelho, e o log já é
      // filtrável por uid, que basta para investigar.
      platform: aparelho.platform,
    });
  }
}
