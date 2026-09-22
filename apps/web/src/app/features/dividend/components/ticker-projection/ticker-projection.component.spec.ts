import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  TickerCard,
  TickerProjectionComponent,
} from './ticker-projection.component';

// ---------------------------------------------------------------------------
// Testes da projeção por ativo (issue #311)
//
// Saiu do dividend.component. Os cards chegam prontos: quem busca o histórico
// de cada ticker e calcula a tendência é o pai.
// ---------------------------------------------------------------------------

describe('TickerProjectionComponent', () => {
  let fixture: ComponentFixture<TickerProjectionComponent>;

  const cards: TickerCard[] = [
    {
      item: {
        ticker: 'HGLG11',
        quantity: 10,
        monthlyDividend: 1.1,
        monthlyIncome: 11,
        paymentDate: '2026-09-15',
      },
      history: [1, 1.05, 1.1],
      trend: 'up',
    },
    {
      item: {
        ticker: 'KNRI11',
        quantity: 5,
        monthlyDividend: 0.75,
        monthlyIncome: 3.75,
      },
      history: [],
      trend: null,
    },
  ];

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function all(selector: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(selector),
    );
  }

  function setup(list: TickerCard[] = cards, hiddenCount = 0): void {
    fixture = TestBed.createComponent(TickerProjectionComponent);
    fixture.componentRef.setInput('cards', list);
    fixture.componentRef.setInput('hiddenCount', hiddenCount);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TickerProjectionComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('deve renderizar um card por ativo', () => {
    setup();

    expect(all('[data-testid="ticker-card"]').length).toBe(2);
  });

  it('deve exibir o provento por cota', () => {
    setup();

    expect(
      all('[data-testid="card-dividend-per-share"]')[0].textContent,
    ).toMatch(/R\$\s?1,10/);
  });

  it('deve marcar a tendência com símbolo e rótulo acessível', () => {
    setup();

    const trend = element('[data-testid="card-trend"]');

    expect(trend?.getAttribute('data-trend')).toBe('up');
    expect(trend?.textContent).toContain('▲');
    expect(trend?.getAttribute('title')).toBe('Provento por cota subiu');
  });

  it('deve omitir a tendência sem histórico suficiente', () => {
    setup([cards[1]]);

    expect(element('[data-testid="card-trend"]')).toBeNull();
  });

  // Um ponto só não forma linha: o sparkline exige pelo menos dois.
  it('deve exibir o sparkline só com mais de um ponto de histórico', () => {
    setup();
    expect(all('app-sparkline').length).toBe(1);

    setup([{ ...cards[0], history: [1.1] }]);
    expect(all('app-sparkline').length).toBe(0);
  });

  describe('recorte gratuito', () => {
    it('não deve exibir o aviso sem ativos ocultos', () => {
      setup();

      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
        'para assinantes',
      );
    });

    it('deve flexionar o aviso conforme a quantidade oculta', () => {
      setup(cards, 1);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Mais 1 ativo para assinantes',
      );

      setup(cards, 3);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Mais 3 ativos para assinantes',
      );
    });
  });
});
