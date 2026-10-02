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
 *     obrigatório, ou valor novo em enum (o Dart gerado recusa o desconhecido);
 *   - na REQUISIÇÃO: campo obrigatório novo, valor de enum removido, ou campo
 *     que mudou de tipo ou foi removido.
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
          for (const valor of d.enum) {
            if (a.enum.size && !a.enum.has(valor)) {
              problemas.push(
                `${rotulo}: valor "${valor}" novo no enum de "${campo || '(corpo)'}"`,
              );
            }
          }
        }
      }

      const antesReq = achatar(base, corpoJson(base, antiga.requestBody));
      const depoisReq = achatar(atual, corpoJson(atual, nova.requestBody));
      for (const [campo, d] of depoisReq) {
        const a = antesReq.get(campo);
        if (!a && d.obrigatorio && campo !== '') {
          problemas.push(
            `${rota}: campo obrigatório "${campo}" novo na requisição`,
          );
        } else if (a && !a.obrigatorio && d.obrigatorio) {
          problemas.push(
            `${rota}: campo "${campo}" passou a ser obrigatório na requisição`,
          );
        }
      }
      for (const [campo, a] of antesReq) {
        const d = depoisReq.get(campo);
        if (!d) {
          problemas.push(`${rota}: campo "${campo}" removido da requisição`);
          continue;
        }
        for (const valor of a.enum) {
          if (d.enum.size && !d.enum.has(valor)) {
            problemas.push(
              `${rota}: valor "${valor}" removido do enum de "${campo}" na requisição`,
            );
          }
        }
      }
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
