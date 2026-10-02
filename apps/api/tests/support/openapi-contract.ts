import { readFileSync } from 'fs';
import { join } from 'path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

// ---------------------------------------------------------------------------
// Validação das respostas da API contra o OpenAPI (issue #499)
//
// `openapi/dindin.yaml` gera os contratos do web e do app, mas nada conferia
// que o corpo devolvido por uma rota o respeita. Um campo opcional, enum ou
// data diferentes do descrito só apareceriam no cliente, depois do deploy.
// Aqui a própria descrição vira o validador: o mesmo YAML que gera os tipos
// valida as respostas reais dos testes de rota.
// ---------------------------------------------------------------------------

const ESPECIFICACAO = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'openapi',
  'dindin.yaml',
);

type Objeto = Record<string, any>;

const especificacao: Objeto = parse(readFileSync(ESPECIFICACAO, 'utf-8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
// Todos os `$ref` da descrição apontam para `#/components/...`; registrar o
// documento inteiro sob um id resolve-os sem reescrever o YAML.
ajv.addSchema({ $id: 'dindin', ...especificacao });

/**
 * Status que a rota não decide: 401 (autenticação), 413 (limite de corpo),
 * 429 (rate limit) e 500 (falha inesperada) vêm de middlewares e do
 * `asyncHandler`, valem para toda rota `/api/*` e sempre têm corpo
 * `ErrorResponse`. Declará-los em cada operação seria ruído; a descrição os
 * registra uma vez, e aqui eles são conferidos contra o mesmo schema.
 */
const STATUS_TRANSVERSAIS = [401, 413, 429, 500];
const RESPOSTA_TRANSVERSAL = {
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

/** Segue `$ref` de resposta (`#/components/responses/X`) até o objeto real. */
const resolverResposta = (resposta: Objeto): Objeto => {
  if (typeof resposta.$ref !== 'string') return resposta;
  const caminho = resposta.$ref.replace(/^#\//, '').split('/');
  return resolverResposta(
    caminho.reduce((no: Objeto, chave) => no[chave], especificacao),
  );
};

/** Os `$ref` da descrição são locais (`#/...`); fora do documento, apontam para ele. */
const apontarRefsParaDocumento = (no: unknown): unknown => {
  if (Array.isArray(no)) return no.map(apontarRefsParaDocumento);
  if (no === null || typeof no !== 'object') return no;
  return Object.fromEntries(
    Object.entries(no as Objeto).map(([chave, valor]) => [
      chave,
      chave === '$ref' && typeof valor === 'string' && valor.startsWith('#')
        ? `dindin${valor}`
        : apontarRefsParaDocumento(valor),
    ]),
  );
};

const validadores = new Map<string, ReturnType<typeof ajv.compile>>();

const validadorDe = (chave: string, schema: Objeto) => {
  let validador = validadores.get(chave);
  if (!validador) {
    validador = ajv.compile(apontarRefsParaDocumento(schema) as Objeto);
    validadores.set(chave, validador);
  }
  return validador;
};

const corpoVazio = (body: unknown): boolean =>
  body === undefined ||
  body === null ||
  body === '' ||
  (typeof body === 'object' && Object.keys(body as Objeto).length === 0);

/**
 * Confere a resposta de `metodo caminho` com o que a descrição declara para
 * aquele status. `caminho` é o template do OpenAPI (`/api/wallets/{id}`).
 * Devolve a lista de divergências; vazia quando a resposta respeita o contrato.
 */
export const validarRespostaContraContrato = (
  resposta: { status: number; body: unknown },
  metodo: string,
  caminho: string,
): string[] => {
  const rota = `${metodo.toUpperCase()} ${caminho}`;
  const operacao: Objeto | undefined =
    especificacao.paths?.[caminho]?.[metodo.toLowerCase()];

  if (!operacao) return [`${rota}: rota fora da descrição OpenAPI`];

  const declarada =
    operacao.responses?.[String(resposta.status)] ??
    (STATUS_TRANSVERSAIS.includes(resposta.status)
      ? RESPOSTA_TRANSVERSAL
      : undefined);
  if (!declarada) {
    return [`${rota}: status ${resposta.status} não está descrito no OpenAPI`];
  }

  const esquema = resolverResposta(declarada).content?.['application/json']
    ?.schema as Objeto | undefined;

  if (!esquema) {
    return corpoVazio(resposta.body)
      ? []
      : [`${rota} ${resposta.status}: descrita sem corpo, mas devolveu um`];
  }

  const validador = validadorDe(`${rota} ${resposta.status}`, esquema);
  if (validador(resposta.body)) return [];

  return (validador.errors ?? []).map(
    (erro) =>
      `${rota} ${resposta.status}: ${erro.instancePath || '(corpo)'} ${erro.message}`,
  );
};

/**
 * Falha o teste, listando as divergências, quando a resposta não respeita o
 * schema da rota. Uso: `expectRespostaConforme(res, 'GET', '/api/wallets/{id}')`.
 */
export const expectRespostaConforme = (
  resposta: { status: number; body: unknown },
  metodo: string,
  caminho: string,
): void => {
  const erros = validarRespostaContraContrato(resposta, metodo, caminho);
  if (erros.length > 0) {
    throw new Error(`Resposta diverge do OpenAPI:\n- ${erros.join('\n- ')}`);
  }
};

const modelos = Object.entries(especificacao.paths as Objeto).map(
  ([caminho, operacoes]) => ({
    caminho,
    metodos: Object.keys(operacoes as Objeto),
    // `{id}` casa um segmento; o resto do template é literal.
    regex: new RegExp(
      `^${caminho
        .split(/\{[^}]+\}/)
        .map((trecho) => trecho.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]+')}$`,
    ),
  }),
);

/**
 * Template do OpenAPI para um caminho real (`/api/wallets/w1` →
 * `/api/wallets/{id}`), ou `undefined` quando a descrição não tem a rota.
 */
export const caminhoDaDescricao = (
  metodo: string,
  url: string,
): string | undefined => {
  const caminho = url.split('?')[0];
  return modelos.find(
    (modelo) =>
      modelo.metodos.includes(metodo.toLowerCase()) &&
      modelo.regex.test(caminho),
  )?.caminho;
};
