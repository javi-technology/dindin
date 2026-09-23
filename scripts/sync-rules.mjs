#!/usr/bin/env node
/**
 * Gera os guias de regras a partir do CLAUDE.md (issue #325).
 *
 * As regras viviam em quatro arquivos mantidos à mão e divergiam em silêncio.
 * Agora só o CLAUDE.md é escrito; os demais saem daqui.
 *
 *   node scripts/sync-rules.js           regenera os arquivos
 *   node scripts/sync-rules.js --check   falha se algum estiver desatualizado
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = 'CLAUDE.md';

/**
 * Cada destino traz só o próprio cabeçalho: o corpo é o do CLAUDE.md.
 */
const DESTINOS = [
  {
    arquivo: 'AGENTS.md',
    cabecalho: [
      '# DinDin — Diretrizes do Projeto',
      '',
      '> **Arquivo gerado.** A fonte é o `CLAUDE.md`; edite lá e rode',
      '> `npm run docs:rules`. Alteração feita direto aqui é perdida na próxima',
      '> geração e reprovada pela suíte.',
    ].join('\n'),
  },
  {
    arquivo: 'GEMINI.md',
    cabecalho: [
      '# DinDin — Diretrizes do Projeto',
      '',
      '> **Arquivo gerado.** A fonte é o `CLAUDE.md`; edite lá e rode',
      '> `npm run docs:rules`. Alteração feita direto aqui é perdida na próxima',
      '> geração e reprovada pela suíte.',
    ].join('\n'),
  },
  {
    arquivo: '.github/copilot-instructions.md',
    cabecalho: [
      '# DinDin — Diretrizes do Projeto',
      '',
      '> **Arquivo gerado.** A fonte é o `CLAUDE.md`; edite lá e rode',
      '> `npm run docs:rules`. Alteração feita direto aqui é perdida na próxima',
      '> geração e reprovada pela suíte.',
    ].join('\n'),
  },
];

/** Marcadores do bloco que o próprio rtk injeta e mantém. */
const RTK_ABRE = '<!-- rtk-instructions v2 -->';
const RTK_FECHA = '<!-- /rtk-instructions -->';

/**
 * O corpo da fonte, sem o título e sem o aviso de fonte primária: o que vale
 * para todo agente começa na primeira seção.
 */
function corpoDaFonte() {
  const fonte = readFileSync(join(repoRoot, FONTE), 'utf-8');
  const inicio = fonte.indexOf('\n## ');

  if (inicio === -1) {
    throw new Error(`${FONTE} não tem nenhuma seção de nível 2.`);
  }

  return fonte.slice(inicio + 1).trimEnd();
}

/**
 * O bloco do rtk é gerado por outra ferramenta, fora deste repositório.
 * Sobrescrevê-lo faria o `rtk` reinjetá-lo e o arquivo nunca ficaria em dia,
 * então ele é preservado como está.
 */
function blocoRtkExistente(arquivo) {
  let atual;
  try {
    atual = readFileSync(join(repoRoot, arquivo), 'utf-8');
  } catch {
    return '';
  }

  const inicio = atual.indexOf(RTK_ABRE);
  const fim = atual.indexOf(RTK_FECHA);

  if (inicio === -1 || fim === -1) {
    return '';
  }

  return `\n\n${atual.slice(inicio, fim + RTK_FECHA.length).trim()}`;
}

function conteudoEsperado(destino, corpo) {
  return `${destino.cabecalho}\n\n${corpo}${blocoRtkExistente(destino.arquivo)}\n`;
}

function main() {
  const verificar = process.argv.includes('--check');
  const corpo = corpoDaFonte();
  const desatualizados = [];

  for (const destino of DESTINOS) {
    const caminho = join(repoRoot, destino.arquivo);
    const esperado = conteudoEsperado(destino, corpo);

    let atual = null;
    try {
      atual = readFileSync(caminho, 'utf-8');
    } catch {
      // arquivo ainda não existe
    }

    if (atual === esperado) {
      continue;
    }

    if (verificar) {
      desatualizados.push(destino.arquivo);
    } else {
      writeFileSync(caminho, esperado);
      console.log(`atualizado: ${destino.arquivo}`);
    }
  }

  if (desatualizados.length > 0) {
    console.error(
      `Desatualizados em relação ao ${FONTE}: ${desatualizados.join(', ')}.\n` +
        'Rode `npm run docs:rules` e inclua o resultado no commit.',
    );
    process.exit(1);
  }
}

main();
