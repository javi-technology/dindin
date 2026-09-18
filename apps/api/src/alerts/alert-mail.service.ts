import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { Alert } from 'dindin-models';

/**
 * Envio de e-mail dos alertas de preço-alvo (issue #265).
 *
 * O transporte é a extensão `firestore-send-email` (Trigger Email): basta
 * gravar um documento na coleção `mail` e a extensão entrega via SMTP. Assim a
 * API não carrega credencial nem cliente de e-mail, e o teste verifica o
 * documento gravado em vez de mockar um provedor HTTP.
 *
 * O id do documento em `mail` é o id do alerta, então uma reexecução do job
 * (retry do scheduler) sobrescreve o mesmo documento em vez de enfileirar um
 * segundo e-mail.
 */

const APP_URL = 'https://dindin-4e720.web.app/geladeira';

function formatCurrency(value: number): string {
  // O Intl separa "R$" do valor com espaço não-quebrável; trocar por espaço
  // comum evita que o caractere apareça cru em clientes de e-mail que não
  // interpretam o UTF-8 do corpo em texto puro.
  return value
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}

function buildMessage(alert: Alert) {
  const current = formatCurrency(alert.currentPrice);
  const target = formatCurrency(alert.targetPrice);
  const fridge = alert.fridgeName || 'sua geladeira';

  const text = [
    `${alert.ticker} atingiu o preço-alvo que você definiu.`,
    '',
    `Preço atual: ${current}`,
    `Preço-alvo: ${target}`,
    `Geladeira: ${fridge}`,
    '',
    `Veja na geladeira: ${APP_URL}`,
    '',
    'Este é um aviso automático do DinDin e não é recomendação de investimento.',
  ].join('\n');

  const html = [
    `<p><strong>${alert.ticker}</strong> atingiu o preço-alvo que você definiu.</p>`,
    '<ul>',
    `<li>Preço atual: <strong>${current}</strong></li>`,
    `<li>Preço-alvo: ${target}</li>`,
    `<li>Geladeira: ${fridge}</li>`,
    '</ul>',
    `<p><a href="${APP_URL}">Ver na geladeira</a></p>`,
    '<p style="color:#6b7280;font-size:12px">Este é um aviso automático do DinDin e não é recomendação de investimento.</p>',
  ].join('');

  return {
    subject: `${alert.ticker} atingiu o preço-alvo de ${target}`,
    text,
    html,
  };
}

async function userEmail(userId: string): Promise<string | undefined> {
  try {
    return (await getAuth().getUser(userId)).email ?? undefined;
  } catch (error) {
    console.warn(`[sendAlertEmails] Usuário ${userId} não encontrado no Auth`, {
      message: (error as Error).message,
    });
    return undefined;
  }
}

/**
 * Enfileira um e-mail por alerta ainda não notificado e marca `notifiedAt`.
 * Retorna quantos e-mails foram enfileirados.
 */
export async function sendAlertEmails(
  userId: string,
  alerts: Alert[],
  now = new Date(),
): Promise<number> {
  const pending = alerts.filter((alert) => !alert.notifiedAt);
  if (pending.length === 0) return 0;

  const email = await userEmail(userId);
  if (!email) {
    console.warn(
      `[sendAlertEmails] Usuário ${userId} sem e-mail: ${pending.length} alerta(s) sem aviso`,
    );
    return 0;
  }

  const mail = getFirestore().collection('mail');
  const userAlerts = getFirestore()
    .collection('users')
    .doc(userId)
    .collection('alerts');
  const notifiedAt = now.toISOString();
  let sent = 0;

  for (const alert of pending) {
    try {
      await mail.doc(alert.id).set({
        to: [email],
        message: buildMessage(alert),
      });
      await userAlerts.doc(alert.id).update({ notifiedAt });
      sent += 1;
    } catch (error) {
      // Uma falha de envio não pode impedir o aviso dos demais ativos: o
      // alerta segue sem `notifiedAt` e a próxima execução tenta de novo.
      console.error(
        `[sendAlertEmails] Erro ao enfileirar e-mail de ${alert.ticker} para ${userId}:`,
        { message: (error as Error).message },
      );
    }
  }

  return sent;
}
