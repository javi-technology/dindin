#!/usr/bin/env node
/**
 * Gera os contratos da API para TypeScript e Dart (issue #399).
 *
 * A fonte é `openapi/dindin.yaml`. Antes, `packages/shared-types` era escrito
 * à mão e o app Flutter não tinha como consumi-lo: o contrato seria repetido
 * em Dart, e um campo renomeado na API só apareceria no celular do usuário,
 * depois de o deploy ter passado no CI.
 *
 *   node scripts/gen-contracts.mjs           regenera os arquivos
 *   node scripts/gen-contracts.mjs --check   falha se algum estiver desatualizado
 *
 * `x-ts-import` marca o schema que já existe em `dindin-models`: o TypeScript
 * importa e reexporta de lá, em vez de criar uma segunda verdade sobre os
 * tipos de ativo aceitos (o problema que a #303 resolveu). O Dart, que não
 * tem esse pacote, gera a classe.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parse } from 'yaml';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = 'openapi/dindin.yaml';
const DESTINO_TS = 'packages/shared-types/generated.ts';
const DESTINO_DART = 'apps/mobile/lib/contracts/contracts.g.dart';

const AVISO = [
  'Arquivo gerado — não edite à mão.',
  '',
  `A fonte é \`${FONTE}\`; altere lá e rode \`npm run contracts:gen\`.`,
  'O CI roda `npm run contracts:check` e reprova o que estiver fora de dia.',
];

const spec = parse(readFileSync(join(repoRoot, FONTE), 'utf-8'));
const schemas = spec.components.schemas;

/** Nome do schema apontado por um `$ref`. */
const nomeDoRef = (ref) => ref.replace('#/components/schemas/', '');

/** Schemas que o TypeScript importa de `dindin-models` em vez de declarar. */
const importadosDoModels = Object.entries(schemas)
  .filter(([, schema]) => schema['x-ts-import'] === 'dindin-models')
  .map(([nome]) => nome)
  .sort();

const ehEnum = (schema) => Array.isArray(schema.enum);

/**
 * Se o schema admite `null` como valor.
 *
 * `recommendedWeight` é obrigatório **e** anulável: o ativo está na carteira
 * sugerida, então o campo sempre vem, mas o peso pode não existir. Tratar
 * "obrigatório" como "não nulo" gerava `(json[...] as num).toDouble()`, que
 * estoura em execução, no celular, com `Null is not a subtype of num`.
 */
const admiteNulo = (schema) =>
  (Array.isArray(schema.type) && schema.type.includes('null')) ||
  (Array.isArray(schema.oneOf) &&
    schema.oneOf.some((parte) => parte.type === 'null'));

const ehObjeto = (schema) =>
  schema.type === 'object' || Array.isArray(schema.allOf);

/** Quebra a descrição em linhas de comentário, respeitando o prefixo. */
const comentario = (texto, indent = '') => {
  if (!texto) return [];
  const linhas = String(texto).trim().split('\n');
  if (linhas.length === 1 && linhas[0].length <= 76 - indent.length) {
    return [`${indent}/** ${linhas[0]} */`];
  }
  return [
    `${indent}/**`,
    ...linhas.map((linha) => `${indent} * ${linha}`.trimEnd()),
    `${indent} */`,
  ];
};

// ---------------------------------------------------------------------------
// Achatamento de `allOf`
//
// O OpenAPI compõe resposta por herança (`AssetSimulationResponse` é
// `SimulationResult` mais `ticker`). TypeScript expressaria isso com
// `extends`, mas Dart não tem herança de campos sem reescrever o construtor:
// achatar aqui mantém os dois geradores simples e o contrato igual.
// ---------------------------------------------------------------------------
const achatar = (schema) => {
  if (!Array.isArray(schema.allOf)) {
    return {
      properties: schema.properties ?? {},
      required: new Set(schema.required ?? []),
    };
  }

  const properties = {};
  const required = new Set();

  for (const parte of schema.allOf) {
    const resolvida = parte.$ref ? schemas[nomeDoRef(parte.$ref)] : parte;
    const { properties: p, required: r } = achatar(resolvida);
    Object.assign(properties, p);
    for (const campo of r) required.add(campo);
  }

  return { properties, required };
};

// ---------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------

const tipoTs = (schema) => {
  if (schema.$ref) return nomeDoRef(schema.$ref);

  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.map(tipoTs).join(' | ');
  }

  if (schema.allOf?.length === 1) return tipoTs(schema.allOf[0]);

  if (Array.isArray(schema.enum)) {
    return schema.enum.map((valor) => `'${valor}'`).join(' | ');
  }

  // `type: [number, 'null']` é a forma do OpenAPI 3.1 para anulável.
  if (Array.isArray(schema.type)) {
    return schema.type.map((t) => tipoTs({ ...schema, type: t })).join(' | ');
  }

  switch (schema.type) {
    case 'string':
      return schema.const !== undefined ? `'${schema.const}'` : 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return schema.const !== undefined ? String(schema.const) : 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `${tipoTs(schema.items)}[]`;
    case 'object': {
      if (schema.additionalProperties) {
        return `Record<string, ${tipoTs(schema.additionalProperties)}>`;
      }
      return 'Record<string, unknown>';
    }
    default:
      return 'unknown';
  }
};

const gerarTs = () => {
  const linhas = [
    '/**',
    ...AVISO.map((l) => ` * ${l}`.trimEnd()),
    ' */',
    '',
    `import type {`,
    ...importadosDoModels.map((nome) => `  ${nome},`),
    `} from 'dindin-models';`,
    '',
    '// Reexportados para que `dindin-shared-types` entregue o contrato inteiro,',
    '// sem o consumidor precisar saber de qual pacote cada nome vem.',
    `export type {`,
    ...importadosDoModels.map((nome) => `  ${nome},`),
    `};`,
    '',
  ];

  for (const [nome, schema] of Object.entries(schemas)) {
    if (schema['x-ts-import']) continue;

    linhas.push(...comentario(schema.description));

    if (ehEnum(schema)) {
      linhas.push(`export type ${nome} = ${tipoTs(schema)};`, '');
      continue;
    }

    if (!ehObjeto(schema)) {
      linhas.push(`export type ${nome} = ${tipoTs(schema)};`, '');
      continue;
    }

    const { properties, required } = achatar(schema);

    linhas.push(`export interface ${nome} {`);
    for (const [campo, valor] of Object.entries(properties)) {
      linhas.push(...comentario(valor.description, '  '));
      const opcional = required.has(campo) ? '' : '?';
      linhas.push(`  ${campo}${opcional}: ${tipoTs(valor)};`);
    }
    linhas.push('}', '');
  }

  return `${linhas.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
};

// ---------------------------------------------------------------------------
// Dart
// ---------------------------------------------------------------------------

/** `AssetType` → `assetType`; usado nos nomes de enum e de campo. */
const camel = (texto) => texto.charAt(0).toLowerCase() + texto.slice(1);

/** Valor de enum do OpenAPI para nome válido de enum do Dart. */
const valorDart = (valor) => {
  const limpo = String(valor)
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, '');
  return /^[0-9]/.test(limpo) ? `v${limpo}` : limpo;
};

const tipoDart = (schema) => {
  if (schema.$ref) return nomeDoRef(schema.$ref);

  if (Array.isArray(schema.oneOf)) {
    // `X | null`: o nulo já vem do `?` de quem declara o campo.
    const concretos = schema.oneOf.filter((s) => s.type !== 'null');
    return concretos.length === 1 ? tipoDart(concretos[0]) : 'Object';
  }

  if (schema.allOf?.length === 1) return tipoDart(schema.allOf[0]);

  if (Array.isArray(schema.enum)) return 'String';

  if (Array.isArray(schema.type)) {
    const concretos = schema.type.filter((t) => t !== 'null');
    return concretos.length === 1
      ? tipoDart({ ...schema, type: concretos[0] })
      : 'Object';
  }

  switch (schema.type) {
    case 'string':
      return 'String';
    case 'number':
      return 'double';
    case 'integer':
      return 'int';
    case 'boolean':
      return 'bool';
    case 'array':
      return `List<${tipoDart(schema.items)}>`;
    case 'object':
      return schema.additionalProperties
        ? `Map<String, ${tipoDart(schema.additionalProperties)}>`
        : 'Map<String, dynamic>';
    default:
      return 'Object';
  }
};

/** Expressão que lê `valor` do JSON no tipo certo. */
const lerDart = (schema, expressao) => {
  if (schema.$ref) {
    const alvo = schemas[nomeDoRef(schema.$ref)];
    const nome = nomeDoRef(schema.$ref);
    return ehEnum(alvo)
      ? `${nome}.fromJson(${expressao} as String)`
      : `${nome}.fromJson(${expressao} as Map<String, dynamic>)`;
  }

  if (Array.isArray(schema.oneOf)) {
    const concretos = schema.oneOf.filter((s) => s.type !== 'null');
    return concretos.length === 1
      ? lerDart(concretos[0], expressao)
      : expressao;
  }

  if (schema.allOf?.length === 1) return lerDart(schema.allOf[0], expressao);

  if (Array.isArray(schema.enum)) return `${expressao} as String`;

  if (Array.isArray(schema.type)) {
    const concretos = schema.type.filter((t) => t !== 'null');
    return concretos.length === 1
      ? lerDart({ ...schema, type: concretos[0] }, expressao)
      : expressao;
  }

  switch (schema.type) {
    case 'number':
      // A API devolve `10` para um valor monetário redondo, e o Dart recusa
      // `int` onde espera `double`: converter aqui evita um erro de tipo em
      // tempo de execução, no celular, para um caso que o web nem nota.
      return `(${expressao} as num).toDouble()`;
    case 'integer':
      return `(${expressao} as num).toInt()`;
    case 'array':
      return `(${expressao} as List<dynamic>).map((e) => ${lerDart(schema.items, 'e')}).toList()`;
    case 'object':
      if (schema.additionalProperties) {
        return `(${expressao} as Map<String, dynamic>).map((k, v) => MapEntry(k, ${lerDart(schema.additionalProperties, 'v')}))`;
      }
      return `${expressao} as Map<String, dynamic>`;
    default:
      return `${expressao} as ${tipoDart(schema)}`;
  }
};

/** Expressão que escreve `campo` no JSON. */
const escreverDart = (schema, expressao, opcional) => {
  const sufixo = opcional ? '?' : '';

  if (schema.$ref) {
    return `${expressao}${sufixo}.toJson()`;
  }

  if (Array.isArray(schema.oneOf)) {
    const concretos = schema.oneOf.filter((s) => s.type !== 'null');
    return concretos.length === 1
      ? escreverDart(concretos[0], expressao, opcional)
      : expressao;
  }

  if (schema.allOf?.length === 1) {
    return escreverDart(schema.allOf[0], expressao, opcional);
  }

  if (schema.type === 'array') {
    const item = schema.items;
    if (item.$ref && !ehEnum(schemas[nomeDoRef(item.$ref)])) {
      return `${expressao}${sufixo}.map((e) => e.toJson()).toList()`;
    }
    if (item.$ref) {
      return `${expressao}${sufixo}.map((e) => e.toJson()).toList()`;
    }
    return expressao;
  }

  if (schema.type === 'object' && schema.additionalProperties?.$ref) {
    return `${expressao}${sufixo}.map((k, v) => MapEntry(k, v.toJson()))`;
  }

  if (
    schema.type === 'object' &&
    schema.additionalProperties?.type === 'array'
  ) {
    return `${expressao}${sufixo}.map((k, v) => MapEntry(k, v.map((e) => e.toJson()).toList()))`;
  }

  return expressao;
};

const docDart = (texto, indent = '') => {
  if (!texto) return [];
  return String(texto)
    .trim()
    .split('\n')
    .map((linha) => `${indent}/// ${linha}`.trimEnd());
};

const gerarDart = () => {
  const linhas = [
    '// ignore_for_file: type=lint',
    ...AVISO.map((l) => `// ${l}`.trimEnd()),
    '',
  ];

  for (const [nome, schema] of Object.entries(schemas)) {
    linhas.push(...docDart(schema.description));

    if (ehEnum(schema)) {
      linhas.push(`enum ${nome} {`);
      for (const valor of schema.enum) {
        linhas.push(`  ${valorDart(valor)}('${valor}'),`);
      }
      linhas.push(
        '  ;',
        '',
        `  const ${nome}(this.wire);`,
        '',
        '  /// Valor como a API o transmite.',
        '  final String wire;',
        '',
        `  factory ${nome}.fromJson(String valor) => ${nome}.values.firstWhere(`,
        '        (e) => e.wire == valor,',
        `        orElse: () => throw ArgumentError('${nome} desconhecido: \$valor'),`,
        '      );',
        '',
        '  String toJson() => wire;',
        '}',
        '',
      );
      continue;
    }

    if (!ehObjeto(schema)) {
      linhas.push(`typedef ${nome} = ${tipoDart(schema)};`, '');
      continue;
    }

    const { properties, required } = achatar(schema);
    const campos = Object.entries(properties);

    linhas.push(`class ${nome} {`);

    // Construtor nomeado: com dez ou mais campos, posicional seria ilegível
    // e uma troca de ordem passaria batida pelo compilador.
    linhas.push(`  const ${nome}({`);
    for (const [campo, valor] of campos) {
      // Um campo obrigatório que admite nulo continua `required` no
      // construtor: quem monta o objeto precisa dizer que não sabe o valor,
      // em vez de esquecê-lo por omissão.
      const obrigatorio =
        required.has(campo) && !admiteNulo(valor) ? 'required ' : '';
      linhas.push(`    ${obrigatorio}this.${camel(campo)},`);
    }
    linhas.push('  });', '');

    linhas.push(
      `  factory ${nome}.fromJson(Map<String, dynamic> json) => ${nome}(`,
    );
    for (const [campo, valor] of campos) {
      const acesso = `json['${campo}']`;
      if (required.has(campo) && !admiteNulo(valor)) {
        linhas.push(`        ${camel(campo)}: ${lerDart(valor, acesso)},`);
      } else {
        linhas.push(
          `        ${camel(campo)}: ${acesso} == null ? null : ${lerDart(valor, acesso)},`,
        );
      }
    }
    linhas.push('      );', '');

    for (const [campo, valor] of campos) {
      linhas.push(...docDart(valor.description, '  '));
      const nulo = required.has(campo) && !admiteNulo(valor) ? '' : '?';
      linhas.push(`  final ${tipoDart(valor)}${nulo} ${camel(campo)};`);
    }
    linhas.push('');

    // Campo ausente e campo nulo são coisas diferentes para a API: omitir o
    // opcional não enviado evita apagar no servidor o que o app não conhece.
    linhas.push('  Map<String, dynamic> toJson() => {');
    for (const [campo, valor] of campos) {
      const ref = camel(campo);
      const nulavel = !required.has(campo) || admiteNulo(valor);
      const escrita = escreverDart(valor, ref, nulavel);

      // O obrigatório-mas-anulável é sempre enviado, inclusive como `null`:
      // omiti-lo mudaria o pedido, porque a API distingue campo ausente de
      // campo nulo.
      if (required.has(campo)) {
        linhas.push(`        '${campo}': ${escrita},`);
      } else {
        linhas.push(`        if (${ref} != null) '${campo}': ${escrita},`);
      }
    }
    linhas.push('      };', '}', '');
  }

  return `${linhas.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
};

// ---------------------------------------------------------------------------

/**
 * Passa o TypeScript gerado pelo Prettier e o Dart pelo `dart format`, para o arquivo versionado já sair
 * no estilo que `mobile:format:check` exige — do contrário, as duas
 * verificações do CI se contradiriam: uma pedindo o texto do gerador, outra
 * o texto formatado.
 *
 * O SDK do Dart não existe no job de Node, e é ele quem roda os testes. Por
 * isso a ausência do binário não é erro: a conferência do Dart fica a cargo
 * do job `build-and-test-mobile`, que tem o Flutter instalado, e o gerador
 * diz isso em voz alta em vez de dar um falso "está em dia".
 */
const formatarTs = async (conteudo) => {
  // Sem `resolveConfig` o Prettier usaria os padrões dele, e não o
  // `.prettierrc` do repositório: o gerado sairia com aspas duplas e o
  // `format:check` do CI o reprovaria a cada geração.
  const caminho = join(repoRoot, DESTINO_TS);
  const config = (await resolveConfig(caminho)) ?? {};

  return format(conteudo, { ...config, parser: 'typescript' });
};

const formatarDart = (conteudo) => {
  try {
    return execFileSync('dart', ['format'], {
      input: conteudo,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};

const main = async () => {
  const conferir = process.argv.includes('--check');

  const dart = formatarDart(gerarDart());
  const saidas = [[DESTINO_TS, await formatarTs(gerarTs())]];
  if (dart !== null) saidas.push([DESTINO_DART, dart]);

  let desatualizados = 0;

  for (const [destino, conteudo] of saidas) {
    const caminho = join(repoRoot, destino);

    if (conferir) {
      let atual = '';
      try {
        atual = readFileSync(caminho, 'utf-8');
      } catch {
        atual = '';
      }
      if (atual !== conteudo) {
        console.error(`desatualizado: ${destino}`);
        desatualizados += 1;
      }
      continue;
    }

    mkdirSync(dirname(caminho), { recursive: true });
    writeFileSync(caminho, conteudo);
    console.log(`atualizado: ${destino}`);
  }

  if (dart === null) {
    console.warn(
      `sem o SDK do Dart: ${DESTINO_DART} não foi conferido aqui — quem o` +
        ' confere é o job `build-and-test-mobile`, que tem o Flutter.',
    );
  }

  if (conferir && desatualizados > 0) {
    console.error(
      `\n${desatualizados} arquivo(s) fora de dia. Rode \`npm run contracts:gen\`.`,
    );
    process.exit(1);
  }
};

await main();
