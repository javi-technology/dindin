import { NextFunction, Request, Response } from 'express';
import { logWarn } from '../shared/logger';

/**
 * Versão mínima do app aceita pela API (issue #500).
 *
 * O web atualiza junto com o Hosting; o app fica instalado e continua rodando
 * depois de um deploy. Uma mudança incompatível no contrato quebraria o app
 * antigo até uma nova versão chegar às lojas, então a API consegue recusá-lo
 * com um código de contrato (`APP_UPDATE_REQUIRED`) e o app mostra a tela de
 * atualização obrigatória. A política completa está em
 * `docs/compatibilidade-app-api.md`.
 */

/** Cabeçalho em que o app informa a versão instalada (`X.Y.Z`, com `+build`). */
export const APP_VERSION_HEADER = 'X-App-Version';

/** Código de contrato lido pelo app para abrir a tela de atualização. */
export const APP_UPDATE_REQUIRED = 'APP_UPDATE_REQUIRED';

/** Versão mínima padrão: todo app já publicado. Sobe quando o contrato quebra. */
const DEFAULT_MIN_APP_VERSION = '1.0.0';

const VERSION = /^(\d+)\.(\d+)\.(\d+)/;

/**
 * Compara duas versões `X.Y.Z`, ignorando sufixo de build e de pré-release.
 * Devolve `undefined` quando alguma não tem o formato.
 */
export function compareVersions(a: string, b: string): number | undefined {
  const [pa, pb] = [VERSION.exec(a), VERSION.exec(b)];
  if (!pa || !pb) return undefined;

  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Mínima em vigor: `APP_MIN_VERSION`, quando válida, ou o padrão. */
export function minAppVersion(): string {
  const configured = process.env.APP_MIN_VERSION;
  return configured && VERSION.test(configured)
    ? configured
    : DEFAULT_MIN_APP_VERSION;
}

/**
 * Recusa com 426 o app abaixo da versão mínima.
 *
 * Quem não manda o cabeçalho passa: o web não o tem, e os apps publicados
 * antes desta política também não — bloqueá-los seria derrubar o app inteiro
 * no deploy. A versão ilegível passa pelo mesmo motivo: errar para o lado de
 * bloquear um usuário legítimo custa mais que deixar passar um cabeçalho
 * malformado.
 */
export function requireMinAppVersion(
  minimum: () => string = minAppVersion,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const sent = req.get(APP_VERSION_HEADER);
    const required = minimum();

    if (sent && (compareVersions(sent, required) ?? 0) < 0) {
      logWarn('appVersion.rejected', {
        method: req.method,
        path: req.path,
        appVersion: sent,
        minVersion: required,
      });
      res.status(426).json({
        error: 'Esta versão do app não é mais aceita. Atualize o DinDin.',
        code: APP_UPDATE_REQUIRED,
      });
      return;
    }

    next();
  };
}
