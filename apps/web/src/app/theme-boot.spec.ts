import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from './core/services/theme.service';

/*
  Salto de tema no carregamento (issue #394): se o tema só fosse aplicado
  quando o Angular sobe, quem escolheu o escuro veria a tela clara piscar
  antes. Por isso o `index.html` resolve o tema antes da primeira pintura, e é
  esse contrato que o teste guarda.
*/
const html = readFileSync(resolvePath('src/index.html'), 'utf8');

describe('tema antes da primeira pintura', () => {
  it('resolve o tema no head, antes do corpo da página', () => {
    const script = html.indexOf('data-theme');
    const body = html.indexOf('<body');

    expect(script).toBeGreaterThanOrEqual(0);
    expect(script).toBeLessThan(body);
  });

  it('usa a mesma chave de armazenamento do serviço de tema', () => {
    expect(html).toContain(THEME_STORAGE_KEY);
  });

  it('cai na preferência do sistema quando não há escolha guardada', () => {
    expect(html).toContain('prefers-color-scheme: dark');
  });
});
