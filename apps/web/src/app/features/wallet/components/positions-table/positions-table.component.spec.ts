import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Position } from 'dindin-models';
import {
  DividendYieldResponse,
  MonthlyIncomeResponse,
} from '../../../../core/services/dividend.service';
import { PositionsTableComponent } from './positions-table.component';

// ---------------------------------------------------------------------------
// Testes da tabela de posições (issue #309)
//
// A tabela saiu do wallet.component junto com a ordenação e os totais, que só
// existem por causa dela. O componente recebe posições e agregados e devolve
// as ações de linha; quem fala com a API continua sendo o pai.
// ---------------------------------------------------------------------------

describe('PositionsTableComponent', () => {
  let fixture: ComponentFixture<PositionsTableComponent>;
  let component: PositionsTableComponent;

  const positions: Position[] = [
    {
      id: 'pos-1',
      walletId: 'wallet-1',
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 100,
      averagePrice: 10,
      currentPrice: 12,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'pos-2',
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: 100,
      currentPrice: 90,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const dividendYield: DividendYieldResponse = {
    byTicker: [
      { ticker: 'MXRF11', annualIncome: 120, currentValue: 1200, yield: 10 },
      { ticker: 'HGLG11', annualIncome: 45, currentValue: 900, yield: 5 },
    ],
    total: { annualIncome: 165, currentValue: 2100, yield: 7.857 },
  };

  const monthlyIncome: MonthlyIncomeResponse = {
    byTicker: [
      {
        ticker: 'MXRF11',
        quantity: 100,
        monthlyDividend: 0.1,
        monthlyIncome: 10,
      },
      {
        ticker: 'HGLG11',
        quantity: 10,
        monthlyDividend: 0.375,
        monthlyIncome: 3.75,
      },
    ],
    total: 13.75,
    totalFromFridge: 2.5,
  };

  function rows(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    );
  }

  function tickers(): string[] {
    return rows().map(
      (row) => row.querySelector('td')?.textContent?.trim() ?? '',
    );
  }

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function sortButton(column: string): HTMLButtonElement {
    return element(
      `[data-sort-column="${column}"] button`,
    ) as HTMLButtonElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PositionsTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PositionsTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('positions', positions);
    fixture.componentRef.setInput('dividendYield', dividendYield);
    fixture.componentRef.setInput('monthlyIncome', monthlyIncome);
    fixture.detectChanges();
  });

  describe('conteúdo', () => {
    it('deve renderizar uma linha por posição', () => {
      expect(rows().length).toBe(2);
    });

    it('deve exibir o preço atual quando houver cotação', () => {
      // A ordem padrão é por ticker, então MXRF11 é a segunda linha.
      // MXRF11: 100 × 12 = 1.200,00
      const segunda = rows()[1].textContent ?? '';

      expect(segunda).toContain('MXRF11');
      expect(segunda).toMatch(/R\$\s?12,00/);
      expect(segunda).toMatch(/R\$\s?1\.200,00/);
    });

    it('deve usar o preço médio quando não houver cotação', () => {
      fixture.componentRef.setInput('positions', [
        { ...positions[0], currentPrice: null },
      ]);
      fixture.detectChanges();

      expect(rows()[0].textContent).toMatch(/R\$\s?10,00/);
    });

    it('deve exibir os proventos e o DY por ticker', () => {
      const [hglg, mxrf] = rows().map((row) => row.textContent ?? '');

      // HGLG11: R$ 3,75/mês e DY de 5%; MXRF11: R$ 10,00/mês e DY de 10%.
      expect(hglg).toMatch(/R\$\s?3,75/);
      expect(hglg).toContain('5,00%');
      expect(mxrf).toMatch(/R\$\s?10,00/);
      expect(mxrf).toContain('10,00%');
    });

    it('deve marcar como indisponível o provento cortado pelo plano gratuito', () => {
      fixture.componentRef.setInput('monthlyIncome', {
        byTicker: [{ ticker: 'MXRF11', monthlyIncome: 10 }],
        total: 10,
        totalFromFridge: 0,
        limited: true,
      } as MonthlyIncomeResponse);
      fixture.detectChanges();

      const bloqueado = element('[data-testid="proventos-bloqueado"]');

      expect(bloqueado).not.toBeNull();
      expect(bloqueado?.textContent).toContain('—');
    });
  });

  describe('totais', () => {
    it('deve somar o total geral das posições', () => {
      // 100 × 12 + 10 × 90 = 2.100,00
      expect(element('[data-testid="total-geral"]')?.textContent).toMatch(
        /R\$\s?2\.100,00/,
      );
    });

    it('deve exibir os totais de proventos e o DY total', () => {
      expect(element('[data-testid="total-proventos"]')?.textContent).toMatch(
        /R\$\s?13,75/,
      );
      expect(
        element('[data-testid="total-proventos-geladeira"]')?.textContent,
      ).toMatch(/R\$\s?2,50/);
      expect(element('[data-testid="dy-total"]')?.textContent).toContain(
        '7,86',
      );
    });

    it('deve zerar os totais sem agregados carregados', () => {
      fixture.componentRef.setInput('dividendYield', null);
      fixture.componentRef.setInput('monthlyIncome', null);
      fixture.detectChanges();

      expect(element('[data-testid="total-proventos"]')?.textContent).toMatch(
        /R\$\s?0,00/,
      );
      expect(element('[data-testid="dy-total"]')?.textContent).toContain(
        '0,00',
      );
    });
  });

  describe('ordenação', () => {
    it('deve começar por ticker em ordem crescente', () => {
      expect(tickers()).toEqual(['HGLG11', 'MXRF11']);
      expect(
        element('[data-sort-column="ticker"]')?.getAttribute('aria-sort'),
      ).toBe('ascending');
    });

    it('deve inverter a direção ao clicar na coluna ativa', () => {
      sortButton('ticker').click();
      fixture.detectChanges();

      expect(tickers()).toEqual(['MXRF11', 'HGLG11']);
      expect(
        element('[data-sort-column="ticker"]')?.getAttribute('aria-sort'),
      ).toBe('descending');
    });

    it('deve começar crescente ao trocar de coluna', () => {
      sortButton('quantity').click();
      fixture.detectChanges();

      // HGLG11 tem 10 e MXRF11 tem 100.
      expect(tickers()).toEqual(['HGLG11', 'MXRF11']);
      expect(
        element('[data-sort-column="quantity"]')?.getAttribute('aria-sort'),
      ).toBe('ascending');
      expect(
        element('[data-sort-column="ticker"]')?.getAttribute('aria-sort'),
      ).toBe('none');
    });

    it('deve ordenar pelo total da posição', () => {
      sortButton('total').click();
      fixture.detectChanges();

      // HGLG11: 10 × 90 = 900; MXRF11: 100 × 12 = 1.200.
      expect(tickers()).toEqual(['HGLG11', 'MXRF11']);
    });

    // Sem valor na coluna, a posição vai para o fim nas duas direções: o
    // bloqueio do plano gratuito não pode virar "menor valor".
    it('deve jogar para o fim quem não tem provento nas duas direções', () => {
      fixture.componentRef.setInput('monthlyIncome', {
        byTicker: [{ ticker: 'MXRF11', monthlyIncome: 10 }],
        total: 10,
        totalFromFridge: 0,
        limited: true,
      } as MonthlyIncomeResponse);
      fixture.detectChanges();

      sortButton('monthlyIncome').click();
      fixture.detectChanges();
      expect(tickers()).toEqual(['MXRF11', 'HGLG11']);

      sortButton('monthlyIncome').click();
      fixture.detectChanges();
      expect(tickers()).toEqual(['MXRF11', 'HGLG11']);
    });
  });

  describe('ações', () => {
    it('deve emitir a posição da linha em cada ação', () => {
      const editada: Position[] = [];
      const movida: Position[] = [];
      const removida: Position[] = [];
      component.edit.subscribe((p) => editada.push(p));
      component.moveToFridge.subscribe((p) => movida.push(p));
      component.remove.subscribe((p) => removida.push(p));

      // A primeira linha é HGLG11, pela ordem crescente de ticker.
      element('[data-testid="btn-editar-0"]')?.click();
      element('[data-testid="btn-mover-geladeira-0"]')?.click();
      element('[data-testid="btn-remover-0"]')?.click();

      expect(editada).toEqual([positions[1]]);
      expect(movida).toEqual([positions[1]]);
      expect(removida).toEqual([positions[1]]);
    });
  });
});
