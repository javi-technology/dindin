import { Request } from 'express';

/**
 * Parâmetro de rota como texto (issue #317).
 *
 * O Express 5 tipa `req.params[x]` como `string | string[]`, porque um
 * curinga pode casar vários segmentos. Os controllers usam esses valores como
 * id de documento no Firestore, onde um array viraria `'a,b'` sem aviso — daí
 * ficar com o primeiro segmento, e com texto vazio quando não há nada.
 */
export function routeParam(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[
    name
  ];

  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
