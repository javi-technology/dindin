import request from 'supertest';
import {
  app,
  onBbWalletPdfUploaded,
  syncBbWalletScheduled,
} from '../src/index';

describe('API Health', () => {
  it('deve retornar status ok do projeto', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', project: 'dindin' });
  });

  it('deve exportar o agendamento e o trigger da carteira BB', () => {
    expect(syncBbWalletScheduled).toBeDefined();
    expect(onBbWalletPdfUploaded).toBeDefined();
  });
});
