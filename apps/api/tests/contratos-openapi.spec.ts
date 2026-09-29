import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Descrição única dos contratos da API (issue #399)
//
// `packages/shared-types` é o que mantém api e web em acordo sobre o formato
// das respostas — e é TypeScript, que o app Flutter não consome. Sem uma
// ponte, o app repetiria cada contrato à mão e um campo renomeado na API só
// apareceria no celular do usuário, depois do deploy ter passado no CI.
//
// A descrição OpenAPI passa a ser a fonte: dela saem os tipos de TS e os
// modelos Dart. Estes testes são o que impede a fonte de virar enfeite —
// uma rota fora dela, ou código gerado desatualizado, reprova o pipeline.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

const ESPECIFICACAO = 'openapi/dindin.yaml';
const TS_GERADO = 'packages/shared-types/generated.ts';
const DART_GERADO = 'apps/mobile/lib/contracts/contracts.g.dart';

/** Rotas registradas no Express, na forma `GET /api/wallets/{id}`. */
const rotasDoExpress = (): string[] => {
  const fonte = conteudo('apps/api/src/index.ts');
  const encontradas = fonte.matchAll(
    /app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g,
  );

  return [...encontradas]
    .map(([, metodo, caminho]) => {
      // O OpenAPI nomeia parâmetro entre chaves; o Express, com dois-pontos.
      const openapi = caminho.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      return `${metodo.toUpperCase()} ${openapi}`;
    })
    .filter((rota) => rota.includes('/api/'))
    .sort();
};

/** Rotas descritas no OpenAPI, na mesma forma. */
const rotasDaEspecificacao = (): string[] => {
  const linhas = conteudo(ESPECIFICACAO).split('\n');
  const rotas: string[] = [];
  let caminhoAtual = '';
  let dentroDePaths = false;

  for (const linha of linhas) {
    if (/^paths:/.test(linha)) {
      dentroDePaths = true;
      continue;
    }
    if (dentroDePaths && /^[a-z]/.test(linha)) break;
    if (!dentroDePaths) continue;

    const caminho = linha.match(/^ {2}(\/[^\s:]*):/);
    if (caminho) {
      caminhoAtual = caminho[1];
      continue;
    }

    const metodo = linha.match(/^ {4}(get|post|put|patch|delete):/);
    if (metodo && caminhoAtual) {
      rotas.push(`${metodo[1].toUpperCase()} ${caminhoAtual}`);
    }
  }

  return rotas.sort();
};

describe('contratos da API', () => {
  describe('descrição única', () => {
    it('deve estar versionada no repositório', () => {
      expect(existsSync(join(repoRoot, ESPECIFICACAO))).toBe(true);
    });

    it('deve declarar a versão do OpenAPI e o título da API', () => {
      const spec = conteudo(ESPECIFICACAO);

      expect(spec).toMatch(/^openapi:\s*['"]?3\./m);
      expect(spec).toMatch(/^\s{2}title:\s*.*DinDin/m);
    });

    // O objetivo da issue é descrever o que existe: uma rota que só mora no
    // Express volta a ser contrato implícito, que o app copiaria à mão.
    it('deve cobrir todas as rotas registradas no Express', () => {
      expect(rotasDaEspecificacao()).toEqual(
        expect.arrayContaining(rotasDoExpress()),
      );
    });

    it('não deve descrever rota que a API não expõe', () => {
      const express = rotasDoExpress();

      expect(
        rotasDaEspecificacao().filter((rota) => !express.includes(rota)),
      ).toEqual([]);
    });
  });

  describe('tipos de TypeScript gerados', () => {
    it('devem existir e avisar que são gerados', () => {
      const gerado = conteudo(TS_GERADO);

      expect(gerado).toContain('Arquivo gerado');
      expect(gerado).toContain(ESPECIFICACAO);
    });

    // Os consumidores atuais importam de `dindin-shared-types`; o pacote
    // precisa seguir entregando os mesmos nomes, agora vindos do gerado.
    it('devem ser reexportados por dindin-shared-types', () => {
      expect(conteudo('packages/shared-types/index.ts')).toContain(
        "export * from './generated'",
      );
    });

    it.each([
      'MeResponse',
      'DashboardSummaryResponse',
      'CreateWalletRequest',
      'UpdatePositionRequest',
      'MonthlyIncomeResponse',
      'SimulationResult',
      'WalletSimulationResponse',
      'DividendResponse',
    ])('devem declarar %s', (tipo) => {
      expect(conteudo(TS_GERADO)).toMatch(
        new RegExp(`export (interface|type) ${tipo}\\b`),
      );
    });

    // `AssetType` e companhia vivem em `dindin-models`: redeclará-los no
    // gerado criaria uma segunda verdade sobre os tipos de ativo aceitos.
    it('devem importar os enums de dindin-models em vez de redeclará-los', () => {
      const gerado = conteudo(TS_GERADO);

      expect(gerado).toMatch(
        /import type \{[^}]*AssetType[^}]*\} from 'dindin-models'/s,
      );
      expect(gerado).not.toMatch(/export type AssetType\s*=/);
    });
  });

  describe('modelos Dart gerados', () => {
    const dart = (): string => conteudo(DART_GERADO);

    it('devem existir e avisar que são gerados', () => {
      expect(dart()).toContain('Arquivo gerado');
      expect(dart()).toContain(ESPECIFICACAO);
    });

    it.each([
      'MeResponse',
      'DashboardSummaryResponse',
      'CreateWalletRequest',
      'MonthlyIncomeResponse',
      'SimulationResult',
      'WalletSimulationResponse',
      'DividendResponse',
    ])('devem declarar a classe %s', (classe) => {
      expect(dart()).toMatch(new RegExp(`class ${classe}\\b`));
    });

    // Sem desserialização o modelo Dart não serve para nada: o app receberia
    // `Map<String, dynamic>` e voltaria a ler campo por nome, à mão.
    it('devem desserializar e serializar JSON', () => {
      expect(dart()).toContain('MeResponse.fromJson(');
      expect(dart()).toContain('Map<String, dynamic> toJson()');
    });

    it('devem mapear os enums de dindin-models para enum do Dart', () => {
      expect(dart()).toMatch(/enum AssetType\b/);
      expect(dart()).toContain('fii');
    });
  });

  describe('gerador', () => {
    it('deve ser exposto como script do npm', () => {
      const scripts = JSON.parse(conteudo('package.json')).scripts;

      expect(scripts['contracts:gen']).toContain('scripts/gen-contracts.mjs');
      expect(scripts['contracts:check']).toContain('--check');
    });

    // O mesmo contrato de `docs:rules --check`: o que o `--check` reprova é
    // exatamente o que uma nova geração produziria de diferente.
    it('deve reprovar quando o código gerado está desatualizado', () => {
      expect(() =>
        execFileSync('node', ['scripts/gen-contracts.mjs', '--check'], {
          cwd: repoRoot,
          encoding: 'utf-8',
        }),
      ).not.toThrow();
    });
  });

  describe('CI', () => {
    const workflow = (): string => conteudo('.github/workflows/ci-cd.yml');

    it('deve verificar os contratos', () => {
      expect(workflow()).toContain('npm run contracts:check');
    });
  });

  describe('documentação', () => {
    // Passa a existir um passo entre escrever a rota e usá-la; sem isso
    // registrado, o próximo a mexer numa rota descobre o passo pelo CI.
    it('deve explicar o fluxo de alteração de contrato', () => {
      const guia = conteudo('CLAUDE.md');

      expect(guia).toContain(ESPECIFICACAO);
      expect(guia).toContain('npm run contracts:gen');
    });
  });
});
