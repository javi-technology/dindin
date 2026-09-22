import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecommendedWalletAsset } from 'dindin-models';
import {
  RecommendedAssetsTableComponent,
  WalletTab,
} from './recommended-assets-table.component';

// ---------------------------------------------------------------------------
// Testes da tabela de ativos da carteira recomendada (issue #310)
//
// Saiu do recommended-wallet.component junto com as abas Renda e Ganho de
// Capital, que só escolhem qual lista a tabela mostra. Qual aba está ativa
// continua sendo do pai, porque a comparação e a sugestão dependem dela.
// ---------------------------------------------------------------------------

describe('RecommendedAssetsTableComponent', () => {
  let fixture: ComponentFixture<RecommendedAssetsTableComponent>;
  let component: RecommendedAssetsTableComponent;
  let abas: WalletTab[];

  const assets: RecommendedWalletAsset[] = [
    {
      ticker: 'HGLG11',
      segment: 'Logística',
      weight: 12.5,
      closePrice: 160.25,
      ifixWeight: 3.1,
      inCatalog: true,
    },
    {
      ticker: 'XPLG11',
      segment: 'Logística',
      weight: 7.5,
      closePrice: 98.4,
      ifixWeight: 1.8,
      inCatalog: false,
    },
  ];

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function rows(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    );
  }

  function setup(
    list: RecommendedWalletAsset[] = assets,
    tab: WalletTab = 'renda',
  ): void {
    fixture = TestBed.createComponent(RecommendedAssetsTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('assets', list);
    fixture.componentRef.setInput('tab', tab);
    abas = [];
    component.tabChange.subscribe((value) => abas.push(value));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecommendedAssetsTableComponent],
    }).compileComponents();
  });

  it('deve renderizar uma linha por ativo', () => {
    setup();

    expect(rows().length).toBe(2);
  });

  it('deve exibir ticker, segmento, peso e fechamento', () => {
    setup();

    const primeira = rows()[0].textContent ?? '';

    expect(primeira).toContain('HGLG11');
    expect(primeira).toContain('Logística');
    expect(primeira).toContain('12,50');
    expect(primeira).toMatch(/R\$\s?160,25/);
  });

  it('deve marcar o ativo fora do catálogo', () => {
    setup();

    expect(rows()[0].textContent).toContain('Disponível');
    expect(rows()[1].textContent).toContain('fora do catálogo');
  });

  it('deve avisar quando não há ativos', () => {
    setup([]);

    expect(element('[data-testid="empty-assets"]')).not.toBeNull();
    expect(rows().length).toBe(0);
  });

  it('deve pedir a troca de aba', () => {
    setup();

    element('[data-testid="tab-ganho"]')?.click();

    expect(abas).toEqual(['ganho']);
  });

  it('não deve pedir a troca para a aba já ativa', () => {
    setup(assets, 'ganho');

    element('[data-testid="tab-ganho"]')?.click();

    expect(abas).toEqual([]);
  });
});
