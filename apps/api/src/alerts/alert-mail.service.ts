import { getAuth } from 'firebase-admin/auth';
import { Alert } from 'dindin-models';
import { alertsCollection } from '../firestore/paths';
import { logError, logWarn } from '../shared/logger';

/**
 * Envio de e-mail dos alertas de preço-alvo (issue #265).
 *
 * O transporte é a API HTTP do Resend. A extensão Trigger Email seria menos
 * código, mas o Firebase Extensions será desligado em 31/03/2027: adotá-la
 * significaria migrar este envio de novo antes dessa data.
 *
 * O job não trata falha de envio como erro fatal: o alerta fica sem
 * `notifiedAt` e a execução do dia seguinte tenta de novo, sem duplicar o
 * alerta (a dedup vive em `target-price.service.ts`).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;
// O domínio verificado no Resend é o raiz `javitech.online`; o subdomínio
// `send.` que aparece no DNS é o return-path da infra do Resend, não um
// domínio de envio — usá-lo no FROM faria o envio ser recusado.
const DEFAULT_FROM = 'DinDin <alertas@javitech.online>';
// O domínio não tem MX, então a caixa do remetente não recebe: sem Reply-To,
// responder ao alerta devolveria erro. Trocar por um endereço do próprio
// domínio quando houver caixa lá.
const DEFAULT_REPLY_TO = 'vkremersantos@icloud.com';
const APP_URL = 'https://dindin-4e720.web.app/geladeira';
/*
 * Cores da paleta (issue #393) em hexadecimal literal: cliente de e-mail não
 * lê o CSS do app, então o token do Tailwind não chega aqui. Os valores são os
 * do tema claro, porque o fundo da mensagem é o branco do cliente — os pares
 * de texto sobre `#ffffff` ficam acima de 4,5:1.
 */
const MAIL_BACKGROUND = '#ffffff';
const MAIL_TEXT = '#141410';
const MAIL_MUTED = '#52524d';
const MAIL_ACTION = '#008654';
// O Resend limita requisições por segundo; os envios são sequenciais e este
// intervalo os espaça. Os testes zeram para não esperar de verdade.
const SEND_INTERVAL_MS = Number(process.env.ALERT_MAIL_INTERVAL_MS ?? 600);

/** Escapa texto do usuário antes de interpolar no corpo HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCurrency(value: number): string {
  // O Intl separa "R$" do valor com espaço não-quebrável; trocar por espaço
  // comum evita que o caractere apareça cru em clientes de e-mail que não
  // interpretam o UTF-8 do corpo em texto puro.
  return value
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/ /g, ' ');
}

function buildEmail(alert: Alert, to: string) {
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

  // `ticker` e `fridgeName` são texto do usuário: sem escape, um nome de
  // geladeira com markup quebraria o e-mail ou injetaria um link arbitrário.
  const html = [
    `<div style="background-color:${MAIL_BACKGROUND};color:${MAIL_TEXT}">`,
    `<p><strong>${escapeHtml(alert.ticker)}</strong> atingiu o preço-alvo que você definiu.</p>`,
    '<ul>',
    `<li>Preço atual: <strong>${current}</strong></li>`,
    `<li>Preço-alvo: ${target}</li>`,
    `<li>Geladeira: ${escapeHtml(fridge)}</li>`,
    '</ul>',
    `<p><a href="${APP_URL}" style="color:${MAIL_ACTION}">Ver na geladeira</a></p>`,
    `<p style="color:${MAIL_MUTED};font-size:12px">Este é um aviso automático do DinDin e não é recomendação de investimento.</p>`,
    '</div>',
  ].join('');

  return {
    from: process.env.ALERT_MAIL_FROM ?? DEFAULT_FROM,
    to: [to],
    reply_to: process.env.ALERT_MAIL_REPLY_TO ?? DEFAULT_REPLY_TO,
    subject: `${alert.ticker} atingiu o preço-alvo de ${target}`,
    text,
    html,
  };
}

async function userEmail(userId: string): Promise<string | undefined> {
  try {
    return (await getAuth().getUser(userId)).email ?? undefined;
  } catch (error) {
    logWarn('sendAlertEmails.userNotFound', {
      uid: userId,
      message: (error as Error).message,
    });
    return undefined;
  }
}

/** Remove a chave do Resend de qualquer texto que vá para o log. */
function redact(text: string, apiKey: string): string {
  return text.split(apiKey).join('[redacted]');
}

async function postEmail(
  alert: Alert,
  to: string,
  apiKey: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Um retry do scheduler reenviaria o mesmo alerta; a chave é estável
        // por alerta criado, então o Resend entrega uma vez só. Um novo alerta
        // do mesmo ticker (após rearme) tem outro `createdAt` e passa.
        'Idempotency-Key': `${alert.id}_${alert.createdAt}`,
      },
      body: JSON.stringify(buildEmail(alert, to)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body =
        typeof response.text === 'function' ? await response.text() : '';
      throw new Error(
        `Resend respondeu ${response.status}: ${redact(body, apiKey).slice(0, 300)}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Envia um e-mail por alerta ainda não notificado e marca `notifiedAt`.
 * Retorna quantos e-mails foram enviados.
 */
export async function sendAlertEmails(
  userId: string,
  alerts: Alert[],
  now = new Date(),
): Promise<number> {
  const pending = alerts.filter((alert) => !alert.notifiedAt);
  if (pending.length === 0) return 0;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logError('sendAlertEmails.missingApiKey', { pending: pending.length });
    return 0;
  }

  const email = await userEmail(userId);
  if (!email) {
    logWarn('sendAlertEmails.missingEmail', {
      uid: userId,
      pending: pending.length,
    });
    return 0;
  }

  const userAlerts = alertsCollection(userId);
  const notifiedAt = now.toISOString();
  let sent = 0;

  for (const alert of pending) {
    try {
      if (sent > 0) await wait(SEND_INTERVAL_MS);
      await postEmail(alert, email, apiKey);
      await userAlerts.doc(alert.id).update({ notifiedAt });
      sent += 1;
    } catch (error) {
      // Uma falha de envio não pode impedir o aviso dos demais ativos.
      logError('sendAlertEmails.sendFailed', {
        uid: userId,
        ticker: alert.ticker,
        message: redact((error as Error).message, apiKey),
      });
    }
  }

  return sent;
}
