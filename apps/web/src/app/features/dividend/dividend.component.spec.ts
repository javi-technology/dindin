import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Wallet } from 'dindin-models';
import { DividendComponent } from './dividend.component';
import { DividendService } from '../../core/services/dividend.service';
import { WalletService } from '../../core/services/wallet.service';

describe('DividendComponent', () => {
  let fixture: ComponentFixture<DividendComponent>;
  let dividendServiceMock: jasmine.SpyObj<DividendService>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;

  const wallet = (id: string): Wallet =>
    ({ id, name: `Carteira ${id}`, currency: 'BRL' }) as Wallet;

  const setup = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [DividendComponent],
      providers: [
        { provide: DividendService, useValue: dividendServiceMock },
        { provide: WalletService, useValue: walletServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DividendComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();

    dividendServiceMock = jasmine.createSpyObj('DividendService', [
      'getMonthlyIncome',
      'getMonthlyReport',
      'recordMonthlyDividends',
    ]);
    walletServiceMock = jasmine.createSpyObj('WalletService', ['list']);

    walletServiceMock.list.and.returnValue(of([wallet('w1')]));
    dividendServiceMock.getMonthlyIncome.and.returnValue(
      of({
        byTicker: [
          {
            ticker: 'HGLG11',
            quantity: 150,
            monthlyDividend: 0.9,
            monthlyIncome: 135,
          },
          {
            ticker: 'XPLG11',
            quantity: 50,
            monthlyDividend: 0.7,
            monthlyIncome: 35,
          },
        ],
        total: 176,
        totalFromFridge: 6,
      }),
    );
    dividendServiceMock.getMonthlyReport.and.returnValue(
      of({
        year: 2026,
        months: [
          {
            month: '2026-01',
            total: 180,
            byTicker: [
              { ticker: 'HGLG11', total: 150 },
              { ticker: 'XPLG11', total: 30 },
            ],
          },
          {
            month: '2026-03',
            total: 120,
            byTicker: [{ ticker: 'HGLG11', total: 120 }],
          },
        ],
        byTicker: [
          { ticker: 'HGLG11', total: 270 },
          { ticker: 'XPLG11', total: 30 },
        ],
        total: 300,
        availableYears: [2026, 2025],
      }),
    );
    dividendServiceMock.recordMonthlyDividends.and.returnValue(of([]));
  });

  it('deve usar a mesma fonte mensal da carteira ao inicializar', async () => {
    await setup();

    expect(walletServiceMock.list).toHaveBeenCalled();
    expect(dividendServiceMock.getMonthlyIncome).toHaveBeenCalledWith('w1');
  });

  it('deve exibir o total mensal incluindo a geladeira', async () => {
    await setup();

    const totalValue = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="total-value"]',
    );
    expect(totalValue?.textContent).toContain('R$');
    expect(totalValue?.textContent).toContain('176,00');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fridge-value"]',
      )?.textContent,
    ).toContain('6,00');
  });

  it('deve listar proventos por ticker', async () => {
    await setup();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="monthly-income-table"] tbody tr',
    );
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('HGLG11');
    expect(rows[1].textContent).toContain('XPLG11');
  });

  it('deve consolidar várias carteiras contando a geladeira uma única vez', async () => {
    walletServiceMock.list.and.returnValue(of([wallet('w1'), wallet('w2')]));
    dividendServiceMock.getMonthlyIncome.and.callFake((walletId: string) =>
      of(
        walletId === 'w1'
          ? {
              byTicker: [
                {
                  ticker: 'HGLG11',
                  quantity: 10,
                  monthlyDividend: 1,
                  monthlyIncome: 10,
                },
              ],
              total: 40,
              totalFromFridge: 30,
            }
          : {
              byTicker: [
                {
                  ticker: 'HGLG11',
                  quantity: 5,
                  monthlyDividend: 1,
                  monthlyIncome: 5,
                },
              ],
              total: 35,
              totalFromFridge: 30,
            },
      ),
    );

    await setup();

    expect(fixture.componentInstance.total()).toBe(45);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="monthly-income-table"] tbody tr',
    );
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('15');
  });

  it('deve exibir mensagem vazia quando não há carteiras', async () => {
    walletServiceMock.list.and.returnValue(of([]));

    await setup();

    expect(dividendServiceMock.getMonthlyIncome).not.toHaveBeenCalled();
    expect(fixture.componentInstance.total()).toBe(0);
  });

  it('deve exibir mensagem de erro quando falha ao carregar proventos', async () => {
    walletServiceMock.list.and.returnValue(
      throwError(() => new Error('Network error')),
    );

    await setup();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="error-message"]',
      )?.textContent,
    ).toContain('Erro ao carregar proventos');
  });

  it('deve exibir uma linha por mês com rótulo e total', async () => {
    await setup();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="report-month-row"]',
    );

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('jan/2026');
    expect(rows[0].textContent).toContain('R$');
    expect(rows[0].textContent).toContain('180,00');
  });

  it('deve exibir os proventos por ticker dentro dos meses', async () => {
    await setup();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="report-ticker-row"]',
    );

    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('HGLG11');
    expect(rows[1].textContent).toContain('XPLG11');
  });

  it('deve exibir totais por ticker e o total anual', async () => {
    await setup();

    const tickerRows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="report-ticker-total-row"]',
    );
    const total = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="report-total"]',
    );

    expect(tickerRows.length).toBe(2);
    expect(tickerRows[0].textContent).toContain('HGLG11');
    expect(tickerRows[0].textContent).toContain('270,00');
    expect(total?.textContent).toContain('300,00');
  });

  it('deve recarregar o relatório ao alterar o ano', async () => {
    await setup();

    const select = (fixture.nativeElement as HTMLSelectElement).querySelector(
      '[data-testid="year-select"]',
    ) as HTMLSelectElement;
    select.value = '2025';
    select.dispatchEvent(new Event('change'));

    expect(dividendServiceMock.getMonthlyReport).toHaveBeenCalledWith(2025);
  });

  it('deve exibir mensagem vazia quando não há proventos no ano', async () => {
    dividendServiceMock.getMonthlyReport.and.returnValue(
      of({
        year: 2026,
        months: [],
        byTicker: [],
        total: 0,
        availableYears: [2026],
      }),
    );

    await setup();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="report-empty"]',
      )?.textContent,
    ).toContain('Nenhum provento registrado em');
  });

  it('deve exibir erro do relatório sem ocultar a seção superior', async () => {
    dividendServiceMock.getMonthlyReport.and.returnValue(
      throwError(() => new Error('Network error')),
    );

    await setup();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="report-error"]',
      )?.textContent,
    ).toContain('Erro ao carregar relatório mensal');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="total-projection"]',
      ),
    ).not.toBeNull();
  });

  it('deve registrar os proventos e recarregar o relatório', async () => {
    await setup();
    const reportCallsBefore =
      dividendServiceMock.getMonthlyReport.calls.count();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="record-monthly-button"]',
    ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dividendServiceMock.recordMonthlyDividends).toHaveBeenCalledWith();
    expect(dividendServiceMock.getMonthlyReport.calls.count()).toBeGreaterThan(
      reportCallsBefore,
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="record-success"]',
      )?.textContent,
    ).toContain('Proventos de');
  });

  it('deve exibir erro ao registrar os proventos', async () => {
    dividendServiceMock.recordMonthlyDividends.and.returnValue(
      throwError(() => new Error('Network error')),
    );

    await setup();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="record-monthly-button"]',
    ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="record-error"]',
      )?.textContent,
    ).toContain('Erro ao registrar proventos do mês');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="record-monthly-button"]',
      ),
    ).not.toBeNull();
  });
});
