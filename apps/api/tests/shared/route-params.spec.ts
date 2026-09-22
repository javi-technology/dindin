import { Request } from 'express';
import { routeParam } from '../../src/shared/route-params';

// ---------------------------------------------------------------------------
// Parâmetros de rota como texto (issue #317)
//
// O Express 5 tipa `req.params[x]` como `string | string[]`, porque um
// curinga pode casar vários segmentos. Os controllers usam esses valores como
// id de documento do Firestore, onde um array viraria `'a,b'` silenciosamente.
// ---------------------------------------------------------------------------

function requestWith(params: Record<string, unknown>): Request {
  return { params } as unknown as Request;
}

describe('shared/route-params', () => {
  it('deve devolver o parâmetro simples', () => {
    expect(routeParam(requestWith({ id: 'wallet-1' }), 'id')).toBe('wallet-1');
  });

  it('deve devolver o primeiro segmento quando o parâmetro é lista', () => {
    expect(routeParam(requestWith({ id: ['a', 'b'] }), 'id')).toBe('a');
  });

  it('deve devolver texto vazio quando o parâmetro não existe', () => {
    expect(routeParam(requestWith({}), 'id')).toBe('');
  });

  it('deve devolver texto vazio para lista vazia', () => {
    expect(routeParam(requestWith({ id: [] }), 'id')).toBe('');
  });
});
