import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaymentSchedule } from '../../../../shared/utils/payment-schedule.util';
import { PaymentScheduleComponent } from './payment-schedule.component';

// ---------------------------------------------------------------------------
// Testes da agenda de pagamentos (issue #311)
//
// Saiu do dividend.component. A agenda chega montada pelo util compartilhado,
// já com o recorte gratuito aplicado: aqui entram só os totais de datas e
// ativos ocultos, para o aviso do paywall.
// ---------------------------------------------------------------------------

describe('PaymentScheduleComponent', () => {
  let fixture: ComponentFixture<PaymentScheduleComponent>;

  const schedule: PaymentSchedule = {
    upcoming: [
      {
        date: '2026-09-15',
        total: 11,
        daysUntil: 3,
        relativeLabel: 'em 3 dias',
        items: [
          {
            ticker: 'HGLG11',
            quantity: 10,
            monthlyDividend: 1.1,
            monthlyIncome: 11,
            paymentDate: '2026-09-15',
          },
        ],
      },
    ],
    paid: [
      {
        date: '2026-09-05',
        total: 3.75,
        daysUntil: -7,
        relativeLabel: 'há 7 dias',
        items: [
          {
            ticker: 'KNRI11',
            quantity: 5,
            monthlyDividend: 0.75,
            monthlyIncome: 3.75,
            paymentDate: '2026-09-05',
          },
        ],
      },
    ],
    withoutDate: [
      {
        ticker: 'MXRF11',
        quantity: 100,
        monthlyDividend: 0.1,
        monthlyIncome: 10,
      },
    ],
    upcomingTotal: 11,
    paidTotal: 3.75,
  };

  const vazia: PaymentSchedule = {
    upcoming: [],
    paid: [],
    withoutDate: [],
    upcomingTotal: 0,
    paidTotal: 0,
  };

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function setup(
    value: PaymentSchedule = schedule,
    hiddenDateCount = 0,
    hiddenWithoutDateCount = 0,
  ): void {
    fixture = TestBed.createComponent(PaymentScheduleComponent);
    fixture.componentRef.setInput('schedule', value);
    fixture.componentRef.setInput('hiddenDateCount', hiddenDateCount);
    fixture.componentRef.setInput(
      'hiddenWithoutDateCount',
      hiddenWithoutDateCount,
    );
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentScheduleComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('deve exibir o total a receber e o já pago', () => {
    setup();

    expect(element('[data-testid="schedule-upcoming"]')?.textContent).toMatch(
      /R\$\s?11,00/,
    );
    expect(element('[data-testid="schedule-paid"]')?.textContent).toMatch(
      /R\$\s?3,75/,
    );
  });

  it('deve exibir o rótulo relativo de cada dia', () => {
    setup();

    expect(texto()).toContain('em 3 dias');
    expect(texto()).toContain('há 7 dias');
  });

  it('deve detalhar provento por cota, quantidade e total do item', () => {
    setup();

    const dia = element('[data-testid="schedule-day"]')?.textContent ?? '';

    expect(dia).toContain('HGLG11');
    expect(dia).toMatch(/R\$\s?1,10/);
    expect(dia).toContain('× 10');
  });

  it('deve listar os ativos sem data anunciada', () => {
    setup();

    expect(
      element('[data-testid="schedule-without-date"]')?.textContent,
    ).toContain('MXRF11');
  });

  it('deve omitir os blocos vazios', () => {
    setup(vazia);

    expect(element('[data-testid="schedule-upcoming"]')).toBeNull();
    expect(element('[data-testid="schedule-paid"]')).toBeNull();
    expect(element('[data-testid="schedule-without-date"]')).toBeNull();
  });

  describe('recorte gratuito', () => {
    it('não deve exibir o paywall sem nada oculto', () => {
      setup();

      expect(element('[data-testid="schedule-paywall"]')).toBeNull();
    });

    it('deve contar as datas de pagamento ocultas', () => {
      setup(schedule, 2);

      const paywall =
        element('[data-testid="schedule-paywall"]')?.textContent ?? '';

      expect(paywall).toContain('Mais 2 datas de pagamento bloqueadas.');
      expect(element('[data-testid="schedule-paywall-cta"]')).not.toBeNull();
    });

    it('deve contar os ativos sem data ocultos', () => {
      setup(schedule, 0, 1);

      expect(
        element('[data-testid="schedule-paywall"]')?.textContent,
      ).toContain('Mais 1 ativo sem data anunciada.');
    });

    it('deve juntar os dois avisos com "e"', () => {
      setup(schedule, 2, 3);

      const paywall =
        element('[data-testid="schedule-paywall"]')?.textContent ?? '';

      expect(paywall).toContain('Mais 2 datas de pagamento e');
      expect(paywall).toContain('3 ativos sem data anunciada.');
    });
  });
});
