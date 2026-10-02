import { readFileSync } from 'fs';
import { join } from 'path';

// A ordem dos interceptors importa e não é óbvia: o último da lista é o mais
// próximo do backend e vê o erro primeiro (issue #505).
describe('app.config', () => {
  const fonte = readFileSync(join(__dirname, 'app.config.ts'), 'utf-8');

  it('deve registrar o interceptor que normaliza os erros HTTP', () => {
    expect(fonte).toContain('httpErrorInterceptor');
  });

  it('deve manter a autenticação antes do tratamento de erros', () => {
    const lista = fonte.slice(fonte.indexOf('withInterceptors(['));

    expect(lista.indexOf('authInterceptor')).toBeLessThan(
      lista.indexOf('unauthorizedInterceptor'),
    );
    expect(lista.indexOf('unauthorizedInterceptor')).toBeLessThan(
      lista.indexOf('httpErrorInterceptor'),
    );
  });
});
