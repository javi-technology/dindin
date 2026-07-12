import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes de configuração do angular.json (issue #54)
// Garante que o build de produção do frontend tenha fileReplacements
// configurado para substituir environment.ts por environment.prod.ts.
// ---------------------------------------------------------------------------

describe('apps/web/angular.json – fileReplacements de produção', () => {
  function readAngularJson(): Record<string, unknown> {
    const jsonPath = join(__dirname, '..', '..', 'web', 'angular.json');
    const raw = readFileSync(jsonPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('deve ter fileReplacements na configuração de produção', () => {
    const angularJson = readAngularJson();
    const production =
      (
        (
          (angularJson.projects as Record<string, unknown>)?.[
            'dindin-web'
          ] as Record<string, unknown>
        )?.architect as Record<string, unknown>
      )?.build as Record<string, unknown>;
    const configurations = production?.configurations as Record<
      string,
      unknown
    >;
    const prodConfig = configurations?.production as Record<string, unknown>;

    expect(prodConfig).toBeDefined();
    expect(prodConfig.fileReplacements).toBeDefined();

    const fileReplacements = prodConfig.fileReplacements as Array<
      Record<string, string>
    >;
    expect(Array.isArray(fileReplacements)).toBe(true);
    expect(fileReplacements.length).toBeGreaterThan(0);

    const envReplacement = fileReplacements.find(
      (fr) => fr.replace === 'src/environments/environment.ts',
    );
    expect(envReplacement).toBeDefined();
    expect(envReplacement?.with).toBe('src/environments/environment.prod.ts');
  });
});