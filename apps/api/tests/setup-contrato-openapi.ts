import {
  caminhoDaDescricao,
  validarRespostaContraContrato,
} from './support/openapi-contract';

// ---------------------------------------------------------------------------
// Toda resposta dos testes de rota é conferida com o OpenAPI (issue #499)
//
// Em vez de pedir que cada teste lembre de validar, o supertest passa a
// conferir sozinho o corpo de cada resposta contra o schema da rota: rota nova
// ou alterada já nasce validada, e a divergência reprova o teste que a causou.
// Caminhos fora da descrição (o 404 do coringa `/api/*`) não têm schema e são
// ignorados; a ausência de uma rota na descrição é coberta pelo teste de
// contratos.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Test = require('supertest/lib/test');

const finalizar = Test.prototype.end;

Test.prototype.end = function (this: any, callback?: (...args: any[]) => void) {
  return finalizar.call(this, (erro: unknown, resposta: any) => {
    if (erro || !resposta?.req) return callback?.(erro, resposta);

    const metodo: string = resposta.req.method;
    const caminho = caminhoDaDescricao(metodo, resposta.req.path);
    if (!caminho) return callback?.(erro, resposta);

    const divergencias = validarRespostaContraContrato(
      resposta,
      metodo,
      caminho,
    );
    if (divergencias.length === 0) return callback?.(erro, resposta);

    return callback?.(
      new Error(`Resposta diverge do OpenAPI:\n- ${divergencias.join('\n- ')}`),
      resposta,
    );
  });
};
