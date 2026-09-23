import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Limites mínimos de cobertura (issue #323)
//
// Sem limite configurado, a cobertura só é conhecida quando alguém roda o
// relatório à mão — e cair não quebra nada. Os valores abaixo foram fixados a
// partir da medição feita na própria issue, com folga de um a dois pontos para
// não transformar variação normal em build vermelho.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

describe('limites de cobertura', () => {
  it('deve configurar limite mínimo na API', () => {
    const config = readFileSync(
      join(repoRoot, 'apps', 'api', 'jest.config.js'),
      'utf-8',
    );

    expect(config).toContain('coverageThreshold');
  });

  it('deve configurar limite mínimo no frontend', () => {
    const config = readFileSync(
      join(repoRoot, 'apps', 'web', 'vitest.config.ts'),
      'utf-8',
    );

    expect(config).toMatch(/coverage[\s\S]*thresholds/);
  });

  it('deve expor o script test:coverage nos dois workspaces', () => {
    for (const workspace of ['apps/api', 'apps/web']) {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, workspace, 'package.json'), 'utf-8'),
      );

      expect(pkg.scripts['test:coverage']).toBeDefined();
    }
  });
});
