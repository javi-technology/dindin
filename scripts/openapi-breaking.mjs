#!/usr/bin/env node
/**
 * Compara dois `openapi/dindin.yaml` e reprova a mudança incompatível (#500).
 *
 *   node scripts/openapi-breaking.mjs <base.yaml> <atual.yaml>
 *
 * O app instalado no aparelho só é corrigido por uma nova versão nas lojas,
 * então o que quebra o app já publicado precisa ser deliberado. São
 * incompatíveis, do ponto de vista de quem consome a API:
 *
 *   - rota ou método removido, ou status de sucesso (2xx) removido;
 *   - na RESPOSTA: campo removido, com outro tipo, que deixou de ser
 *     obrigatório, valor novo em enum ou enum removido (o Dart gerado recusa
 *     o valor desconhecido);
 *   - na REQUISIÇÃO: campo obrigatório novo, campo removido, tipo que deixou
 *     de ser aceito, valor de enum removido ou enum novo em campo livre;
 *   - nos PARÂMETROS (da operação ou do path): parâmetro obrigatório novo, que
 *     passou a ser obrigatório, ou com tipo ou enum que recusa o valor antigo.
 *
 * Campo opcional novo na resposta e rota nova são compatíveis. Uma mudança
 * incompatível é aceita quando declarada em `x-incompatible-changes` na raiz
 * do YAML (uma linha por mudança, com a issue e a versão mínima do app), o que
 * deixa o aviso versionado junto do contrato. Só vale a entrada nova em relação
 * à base: a lista é histórico, e não libera mudanças futuras.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'];

const carregar = (arquivo) => parse(readFileSync(arquivo, 'utf-8'));

/** Segue `$ref` local (`#/components/...`) até o objeto. */
const resolver = (doc, no) => {
  let atual = no;
  const vistos = new Set();
  while (atual && typeof atual.$ref === 'string' && !vistos.has(atual.$ref)) {
    vistos.add(atual.$ref);
    atual = atual.$ref
      .replace(/^#\//, '')
      .split('/')
      .reduce((n, chave) => n?.[chave], doc);
  }
  return atual;
};

const tipoDe = (schema) =>
  []
    .concat(schema?.type ?? (schema?.properties ? 'object' : 'unknown'))
    .sort()
    .join('|');

/**
 * Achata o schema em `caminho → { tipo, obrigatorio, enum }`. `allOf` é
 * mesclado; `oneOf`/`anyOf` entram como alternativas no mesmo caminho.
 */
const achatar = (
  doc,
  schema,
  caminho = '',
  saida = new Map(),
  obrigatorio = true,
  pilha = [],
) => {
  const resolvido = resolver(doc, schema);
  if (!resolvido || typeof resolvido !== 'object') return saida;
  const ref = schema?.$ref;
  if (ref && pilha.includes(ref)) return saida;
  const proxima = ref ? [...pilha, ref] : pilha;

  const partes = resolvido.allOf ?? [];
  const props = { ...(resolvido.properties ?? {}) };
  let requeridos = [...(resolvido.required ?? [])];
  for (const parte of partes) {
    const r = resolver(doc, parte);
    Object.assign(props, r?.properties ?? {});
    requeridos = requeridos.concat(r?.required ?? []);
  }

  const atual = saida.get(caminho) ?? {
    tipos: new Set(),
    obrigatorio,
    enum: new Set(),
  };
  atual.tipos.add(
    partes.length && !resolvido.type ? 'object' : tipoDe(resolvido),
  );
  (resolvido.enum ?? []).forEach((v) => atual.enum.add(String(v)));
  atual.obrigatorio = atual.obrigatorio && obrigatorio;
  saida.set(caminho, atual);

  // `obrigatorio` é relativo ao pai: `.metadata.source` obrigatório dentro de
  // `metadata` opcional só é exigido de quem manda `metadata`.
  for (const [nome, filho] of Object.entries(props)) {
    achatar(
      doc,
      filho,
      `${caminho}.${nome}`,
      saida,
      requeridos.includes(nome),
      proxima,
    );
  }
  if (resolvido.items) {
    achatar(doc, resolvido.items, `${caminho}[]`, saida, true, proxima);
  }
  for (const alt of [...(resolvido.oneOf ?? []), ...(resolvido.anyOf ?? [])]) {
    achatar(doc, alt, caminho, saida, obrigatorio, proxima);
  }
  return saida;
};

const corpoJson = (doc, no) =>
  resolver(doc, no)?.content?.['application/json']?.schema;

/** `.a.b` → `.a`; `.a[]` → `.a`; `.a` → `` (o corpo). */
const paiDe = (campo) => campo.replace(/(\.[^.[\]]+|\[\])$/, '');

const atomos = (tipos) => new Set([...tipos].flatMap((t) => t.split('|')));

/** O tipo que o cliente antigo manda ainda é aceito? (`integer` cabe em `number`). */
const tiposRecusados = (antes, depois) => {
  const aceitos = atomos(depois);
  return [...atomos(antes)].filter(
    (t) => !aceitos.has(t) && !(t === 'integer' && aceitos.has('number')),
  );
};

/**
 * O que o cliente antigo manda (corpo ou parâmetro) continua aceito? `remocao`
 * desliga o aviso de campo removido para parâmetros: o servidor ignora o
 * parâmetro de query que não conhece, e o de path removido já é rota removida.
 */
const compararEntrada = (rotulo, antes, depois, problemas, remocao = true) => {
  for (const [campo, d] of depois) {
    const a = antes.get(campo);
    // Campo novo dentro de objeto novo só é exigido de quem manda o objeto,
    // e o cliente antigo não o manda: o próprio objeto é que seria avisado.
    if (!a && d.obrigatorio && campo !== '' && antes.has(paiDe(campo))) {
      problemas.push(`${rotulo}: campo obrigatório "${campo}" novo`);
    } else if (a && !a.obrigatorio && d.obrigatorio) {
      problemas.push(`${rotulo}: campo "${campo}" passou a ser obrigatório`);
    }
  }
  for (const [campo, a] of antes) {
    const d = depois.get(campo);
    if (!d) {
      if (remocao) problemas.push(`${rotulo}: campo "${campo}" removido`);
      continue;
    }
    const recusados = tiposRecusados(a.tipos, d.tipos);
    if (recusados.length) {
      problemas.push(
        `${rotulo}: campo "${campo || '(corpo)'}" mudou de tipo (${[...a.tipos].join(',')} → ${[...d.tipos].join(',')})`,
      );
    }
    if (d.enum.size && !a.enum.size) {
      problemas.push(
        `${rotulo}: campo "${campo || '(corpo)'}" passou a ter enum (${[...d.enum].join(', ')})`,
      );
    }
    for (const valor of a.enum) {
      if (d.enum.size && !d.enum.has(valor)) {
        problemas.push(
          `${rotulo}: valor "${valor}" removido do enum de "${campo || '(corpo)'}"`,
        );
      }
    }
  }
};

/** Parâmetros da operação somados aos do path; o da operação prevalece. */
const parametros = (doc, item, operacao) => {
  const saida = new Map();
  for (const no of [
    ...(item.parameters ?? []),
    ...(operacao.parameters ?? []),
  ]) {
    const p = resolver(doc, no);
    if (!p?.name || !p?.in) continue;
    const esquema = achatar(doc, p.schema);
    const raiz = esquema.get('') ?? { tipos: new Set(), enum: new Set() };
    esquema.set('', { ...raiz, obrigatorio: p.in === 'path' || !!p.required });
    saida.set(`${p.in}:${p.name}`, esquema);
  }
  return saida;
};

/**
 * `in:nome` → caminhos `.in:nome...`, sob uma raiz `''` que representa a
 * operação: assim o parâmetro novo tem pai e entra como campo novo.
 */
const achatarParametros = (mapa) => {
  const saida = new Map([
    ['', { tipos: new Set(['object']), obrigatorio: true, enum: new Set() }],
  ]);
  for (const [chave, esquema] of mapa) {
    for (const [caminho, info] of esquema) {
      saida.set(`.${chave}${caminho}`, info);
    }
  }
  return saida;
};

const comparar = (base, atual) => {
  const problemas = [];

  for (const [caminho, operacoes] of Object.entries(base.paths ?? {})) {
    for (const metodo of METODOS.filter((m) => operacoes[m])) {
      const rota = `${metodo.toUpperCase()} ${caminho}`;
      const nova = atual.paths?.[caminho]?.[metodo];
      if (!nova) {
        problemas.push(`${rota}: rota removida`);
        continue;
      }
      const antiga = operacoes[metodo];

      for (const status of Object.keys(antiga.responses ?? {})) {
        if (!/^2/.test(status)) continue;
        if (!nova.responses?.[status]) {
          problemas.push(`${rota}: status ${status} removido`);
          continue;
        }
        const antes = achatar(base, corpoJson(base, antiga.responses[status]));
        const depois = achatar(atual, corpoJson(atual, nova.responses[status]));
        const reportados = [];
        // Subcampos de um campo já reportado só repetiriam o mesmo problema.
        const filhoDeReportado = (campo) =>
          reportados.some((r) => campo.startsWith(r) && campo !== r);
        for (const [campo, a] of antes) {
          const rotulo = `${rota} ${status}`;
          const d = depois.get(campo);
          if (filhoDeReportado(campo)) continue;
          if (!d) {
            reportados.push(campo);
            problemas.push(
              `${rotulo}: campo "${campo || '(corpo)'}" removido da resposta`,
            );
            continue;
          }
          const tiposA = [...a.tipos].sort().join(',');
          const tiposD = [...d.tipos].sort().join(',');
          if (tiposA !== tiposD) {
            reportados.push(campo);
            problemas.push(
              `${rotulo}: campo "${campo || '(corpo)'}" mudou de tipo (${tiposA} → ${tiposD})`,
            );
          }
          if (a.obrigatorio && !d.obrigatorio) {
            problemas.push(
              `${rotulo}: campo "${campo}" deixou de ser obrigatório na resposta`,
            );
          }
          if (a.enum.size && !d.enum.size) {
            problemas.push(
              `${rotulo}: enum de "${campo || '(corpo)'}" removido (o app recusa valor fora de ${[...a.enum].join(', ')})`,
            );
          }
          for (const valor of d.enum) {
            if (a.enum.size && !a.enum.has(valor)) {
              problemas.push(
                `${rotulo}: valor "${valor}" novo no enum de "${campo || '(corpo)'}"`,
              );
            }
          }
        }
      }

      compararEntrada(
        `${rota} requisição`,
        achatar(base, corpoJson(base, antiga.requestBody)),
        achatar(atual, corpoJson(atual, nova.requestBody)),
        problemas,
      );
      compararEntrada(
        `${rota} parâmetro`,
        achatarParametros(parametros(base, operacoes, antiga)),
        achatarParametros(parametros(atual, atual.paths[caminho], nova)),
        problemas,
        false,
      );
    }
  }

  return problemas;
};

const [, , arquivoBase, arquivoAtual] = process.argv;
if (!arquivoBase || !arquivoAtual) {
  console.error('uso: openapi-breaking.mjs <base.yaml> <atual.yaml>');
  process.exit(2);
}

const base = carregar(arquivoBase);
const atual = carregar(arquivoAtual);
const problemas = comparar(base, atual);
// Só vale a declaração nova: uma lista que nunca é limpa não pode liberar,
// em silêncio, toda mudança incompatível que vier depois.
const jaDeclaradas = new Set(base['x-incompatible-changes'] ?? []);
const declaradas = (atual['x-incompatible-changes'] ?? []).filter(
  (d) => !jaDeclaradas.has(d),
);

if (problemas.length === 0) {
  console.log('OpenAPI: nenhuma mudança incompatível.');
} else if (declaradas.length > 0) {
  console.log(
    'OpenAPI: mudança incompatível declarada em x-incompatible-changes:',
  );
  declaradas.forEach((d) => console.log(`  declarada: ${d}`));
  problemas.forEach((p) => console.log(`  - ${p}`));
} else {
  console.error('OpenAPI: mudança incompatível sem aviso explícito:');
  problemas.forEach((p) => console.error(`  - ${p}`));
  console.error(
    '\nO app instalado não é atualizado com o deploy. Evite a mudança ou declare-a\nem `x-incompatible-changes` (issue e versão mínima do app) e suba a\n`APP_MIN_VERSION`. Ver docs/compatibilidade-app-api.md.',
  );
  process.exit(1);
}
