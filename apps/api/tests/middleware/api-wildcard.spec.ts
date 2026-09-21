import request from 'supertest';

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(),
}));

import { app } from '../../src/index';

// ---------------------------------------------------------------------------
// Cobertura do curinga de `/api` (issue #317)
//
// O Express 5 troca o path-to-regexp e recusa `'/api/*'` sem nome. Se o
// curinga deixar de casar, rotas inexistentes passam a responder 404 **sem**
// autenticação, e as reais deixam de exigir token — sem nenhum teste falhar,
// porque cada rota conhecida é registrada individualmente.
// ---------------------------------------------------------------------------

describe('curinga de /api', () => {
  it('deve exigir token em qualquer caminho sob /api', async () => {
    const response = await request(app).get('/api/rota-inexistente');

    expect(response.status).toBe(401);
  });

  it('deve exigir token em caminho aninhado', async () => {
    const response = await request(app).post('/api/a/b/c');

    expect(response.status).toBe(401);
  });

  it('não deve exigir token fora de /api', async () => {
    const response = await request(app).get('/outra-coisa');

    expect(response.status).toBe(404);
  });
});
