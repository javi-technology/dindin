import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Credencial local sem chave de longa duração (issue #514)
//
// O CI autentica por Workload Identity desde a #322, e a chave JSON de
// service account que ficava em `sa-key.json` virou o caminho de volta
// esquecido: credencial que não expira, em disco, sem dono. A documentação e
// os scripts precisam apontar para a credencial de curta duração, ou a chave
// será recriada na próxima vez que alguém seguir o passo a passo.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

const scripts = readdirSync(join(repoRoot, 'apps/api/src/scripts'))
  .filter((arquivo) => arquivo.endsWith('.ts'))
  .map((arquivo) => `apps/api/src/scripts/${arquivo}`);

const docs = readdirSync(join(repoRoot, 'docs'))
  .filter((arquivo) => arquivo.endsWith('.md'))
  .map((arquivo) => `docs/${arquivo}`);

describe('credencial local sem chave de longa duração', () => {
  describe('guia de autenticação local', () => {
    const guia = 'docs/credenciais-locais.md';

    it('deve existir', () => {
      expect(existsSync(join(repoRoot, guia))).toBe(true);
    });

    it('deve ensinar a credencial de curta duração', () => {
      const texto = conteudo(guia);

      expect(texto).toContain('gcloud auth application-default login');
      expect(texto).toContain('--impersonate-service-account');
    });

    it('deve dizer o que fazer com uma chave JSON que já exista', () => {
      expect(conteudo(guia)).toMatch(/gcloud iam service-accounts keys delete/);
    });

    it('deve ser apontado pelo README', () => {
      expect(conteudo('README.md')).toContain('docs/credenciais-locais.md');
    });
  });

  describe('o que não pode mandar criar a chave', () => {
    it.each([
      'README.md',
      ...docs.filter((d) => !d.endsWith('credenciais-locais.md')),
    ])('%s não deve instruir o uso de sa-key.json', (arquivo) => {
      expect(conteudo(arquivo)).not.toContain('sa-key.json');
    });

    it.each(scripts)('%s não deve instruir o uso de sa-key.json', (arquivo) => {
      expect(conteudo(arquivo)).not.toContain('sa-key.json');
    });
  });

  describe('scripts administrativos', () => {
    it.each(
      scripts.filter((s) => /credenciais|credentials/i.test(conteudo(s))),
    )(
      '%s deve apontar para o guia em vez de mandar criar uma chave',
      (arquivo) => {
        expect(conteudo(arquivo)).toContain('docs/credenciais-locais.md');
      },
    );
  });
});
