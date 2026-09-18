import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Wallet } from 'dindin-models';
import { DividendComponent } from './dividend.component';
import {
  DividendService,
  MonthlyIncomeResponse,
} from '../../core/services/dividend.service';
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
        provideRouter([]),
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
      'getDividendYield',
      'getDividendHistoryBatch',
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
            paymentDate: '2026-09-15',
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
    dividendServiceMock.getDividendYield.and.returnValue(
      of({
        byTicker: [],
        total: { annualIncome: 2112, currentValue: 22000, yield: 9.6 },
      }),
    );
    dividendServiceMock.getDividendHistoryBatch.and.callFake(
      (tickers: string[]) =>
        of({
          byTicker: Object.fromEntries(
            tickers.map((ticker) => [
              ticker,
              [
                { date: '2026-07-15', monthlyDividend: 0.8 },
                { date: '2026-08-15', monthlyDividend: 0.85 },
                { date: '2026-09-15', monthlyDividend: 0.9 },
              ],
            ]),
          ),
        }),
    );
  });

  describe('cards por ticker', () => {
    const cards = (): NodeListOf<Element> =>
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="ticker-card"]',
      );

    it('deve exibir um card por ticker no lugar da tabela', async () => {
      await setup();

      expect(cards().length).toBe(2);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="monthly-income-table"]',
        ),
      ).toBeNull();
    });

    it('deve destacar o valor por cota e o total do ticker', async () => {
      await setup();

      const primeiro = cards()[0];

      expect(
        primeiro.querySelector('[data-testid="card-dividend-per-share"]')
          ?.textContent,
      ).toContain('0,90');
      expect(primeiro.textContent).toContain('HGLG11');
      expect(primeiro.textContent).toContain('135,00');
    });

    it('deve exibir o sparkline a partir do histórico carregado', async () => {
      await setup();

      expect(
        cards()[0].querySelector('[data-testid="sparkline"]'),
      ).toBeTruthy();
    });

    it('deve exibir a tendência de alta do provento por cota', async () => {
      await setup();

      expect(
        cards()[0]
          .querySelector('[data-testid="card-trend"]')
          ?.getAttribute('data-trend'),
      ).toBe('up');
    });

    it('deve buscar o histórico de todos os tickers numa requisição', async () => {
      // Uma requisição por ticker faria uma carteira diversificada esbarrar
      // no rate limit de 100/min por IP ao abrir a tela.
      await setup();

      expect(dividendServiceMock.getDividendHistoryBatch).toHaveBeenCalledTimes(
        1,
      );
      expect(dividendServiceMock.getDividendHistoryBatch).toHaveBeenCalledWith([
        'HGLG11',
        'XPLG11',
      ]);
    });

    it('deve renderizar o card mesmo quando o histórico falha', async () => {
      dividendServiceMock.getDividendHistoryBatch.and.returnValue(
        throwError(() => new Error('falha')),
      );

      await setup();

      expect(cards().length).toBe(2);
      expect(cards()[0].querySelector('[data-testid="sparkline"]')).toBeNull();
      expect(cards()[0].textContent).toContain('HGLG11');
    });
  });

  const kpi = (testid: string): string =>
    (fixture.nativeElement as HTMLElement)
      .querySelector(`[data-testid="${testid}"]`)
      ?.textContent?.trim() ?? '';

  describe('indicadores', () => {
    it('deve exibir o total recebido no ano selecionado', async () => {
      await setup();

      expect(kpi('kpi-year-total')).toContain('300,00');
    });

    it('deve exibir a média mensal dos meses com provento', async () => {
      await setup();

      expect(kpi('kpi-average')).toContain('150,00');
    });

    it('deve exibir o último mês recebido', async () => {
      await setup();

      expect(kpi('kpi-last-month')).toContain('120,00');
    });

    it('deve omitir a variação quando o mês anterior não teve provento', async () => {
      // O relatório padrão tem janeiro e março: fevereiro não é comparável.
      await setup();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="kpi-last-month-variation"]',
        ),
      ).toBeNull();
    });

    it('deve exibir a variação sobre o mês de calendário anterior', async () => {
      dividendServiceMock.getMonthlyReport.and.returnValue(
        of({
          year: 2026,
          months: [
            { month: '2026-02', total: 90, byTicker: [] },
            { month: '2026-03', total: 120, byTicker: [] },
          ],
          byTicker: [],
          total: 210,
          availableYears: [2026],
        }),
      );

      await setup();

      expect(kpi('kpi-last-month-variation')).toContain('33,33');
    });

    it('deve omitir a variação quando há apenas um mês registrado', async () => {
      dividendServiceMock.getMonthlyReport.and.returnValue(
        of({
          year: 2026,
          months: [{ month: '2026-01', total: 180, byTicker: [] }],
          byTicker: [],
          total: 180,
          availableYears: [2026],
        }),
      );

      await setup();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="kpi-last-month-variation"]',
        ),
      ).toBeNull();
    });

    it('deve exibir o dividend yield agregando todas as carteiras', async () => {
      walletServiceMock.list.and.returnValue(of([wallet('w1'), wallet('w2')]));
      dividendServiceMock.getDividendYield.and.returnValues(
        of({
          byTicker: [],
          total: { annualIncome: 1000, currentValue: 10000, yield: 10 },
        }),
        of({
          byTicker: [],
          total: { annualIncome: 200, currentValue: 10000, yield: 2 },
        }),
      );

      await setup();

      expect(dividendServiceMock.getDividendYield).toHaveBeenCalledWith('w1');
      expect(dividendServiceMock.getDividendYield).toHaveBeenCalledWith('w2');
      expect(kpi('kpi-yield')).toContain('6,00');
    });

    it('deve carregar a lista de carteiras uma única vez', async () => {
      await setup();

      expect(walletServiceMock.list).toHaveBeenCalledTimes(1);
    });

    it('deve sinalizar quando o yield depende de proventos ainda não registrados', async () => {
      dividendServiceMock.getDividendYield.and.returnValue(
        of({
          byTicker: [],
          total: { annualIncome: 0, currentValue: 22000, yield: 0 },
        }),
      );

      await setup();

      // Não há mais botão de registro: os pagamentos entram pelo sync (#112).
      expect(kpi('kpi-yield-note')).toContain('registrados automaticamente');
      expect(kpi('kpi-yield-note')).not.toContain('Registrar proventos do mês');
    });

    it('não deve sinalizar nada quando há yield calculado', async () => {
      await setup();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="kpi-yield-note"]',
        ),
      ).toBeNull();
    });

    it('deve exibir o yield zerado quando não há carteiras', async () => {
      walletServiceMock.list.and.returnValue(of([]));

      await setup();

      expect(kpi('kpi-yield')).toContain('0,00');
    });
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

    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="ticker-card"]',
    );
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('HGLG11');
    expect(cards[1].textContent).toContain('XPLG11');
  });

  it('deve exibir a data de pagamento de cada provento', async () => {
    await setup();

    const dates = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="ticker-card"] [data-testid="payment-date"]',
    );

    expect(dates.length).toBe(2);
    expect(dates[0].textContent?.trim()).toBe('15/09/2026');
    expect(dates[1].textContent?.trim()).toBe('—');
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
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="ticker-card"]',
    );
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('15');
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

  it('deve destacar o mês corrente segundo a data de referência', async () => {
    await setup();
    fixture.componentInstance.today.set(new Date(2026, 5, 10));
    fixture.detectChanges();

    const barras = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="monthly-chart"] [data-testid="bar"]',
    );
    const destacadas = Array.from(barras).filter(
      (barra) => barra.getAttribute('data-highlight') === 'true',
    );

    expect(destacadas.length).toBe(1);
    // Junho é o sexto mês: mesma data de referência usada pela agenda.
    expect(barras[5].getAttribute('data-highlight')).toBe('true');
  });

  it('deve exibir o gráfico de barras com os 12 meses do ano', async () => {
    await setup();

    const grafico = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="monthly-chart"]',
    );

    expect(grafico?.querySelector('[data-testid="bar-chart"]')).toBeTruthy();
    expect(grafico?.querySelectorAll('[data-testid="bar"]').length).toBe(12);
  });

  it('deve alinhar a linha de média do gráfico com a média mensal exibida', async () => {
    await setup();

    const grafico = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="monthly-chart"]',
    );
    const linha = grafico?.querySelector('[data-testid="bar-chart-average"]');

    // Média de 150 sobre o maior mês (180): 83,33% da altura útil.
    expect(Number(linha?.getAttribute('y1'))).toBeCloseTo(47.5, 1);
  });

  it('deve manter o detalhamento por mês em bloco recolhível', async () => {
    await setup();

    const detalhe = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="month-details"]',
    );

    expect(detalhe?.tagName.toLowerCase()).toBe('details');
    expect(
      detalhe?.querySelectorAll('[data-testid="report-month-row"]').length,
    ).toBe(2);
  });

  describe('agenda de pagamentos', () => {
    const comHoje = async (ano: number, mes: number, dia: number) => {
      await setup();
      fixture.componentInstance.today.set(new Date(ano, mes - 1, dia));
      fixture.detectChanges();
    };

    it('deve agrupar os pagamentos a receber por data', async () => {
      await comHoje(2026, 9, 10);

      const dias = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="schedule-upcoming"] [data-testid="schedule-day"]',
      );

      expect(dias.length).toBe(1);
      expect(dias[0].textContent).toContain('em 5 dias');
      expect(dias[0].textContent).toContain('15/09/2026');
      expect(dias[0].textContent).toContain('HGLG11');
    });

    it('deve destacar o valor por cota de cada ticker', async () => {
      await comHoje(2026, 9, 10);

      const valorCota = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="schedule-dividend-per-share"]',
      );

      expect(valorCota?.textContent).toContain('0,90');
    });

    it('deve mover para já pagos as datas anteriores a hoje', async () => {
      await comHoje(2026, 9, 20);

      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '[data-testid="schedule-paid"] [data-testid="schedule-day"]',
        ).length,
      ).toBe(1);
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '[data-testid="schedule-upcoming"] [data-testid="schedule-day"]',
        ).length,
      ).toBe(0);
    });

    it('deve avisar que a agenda cobre apenas as carteiras', async () => {
      // `byTicker` traz só posições; a geladeira entra apenas no total da
      // projeção, então sem a nota os números parecem não fechar.
      await comHoje(2026, 9, 10);

      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="schedule-scope-note"]',
        )?.textContent,
      ).toContain('geladeira');
    });

    it('deve listar à parte os tickers sem data anunciada', async () => {
      await comHoje(2026, 9, 10);

      const semData = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="schedule-without-date"]',
      );

      expect(semData?.textContent).toContain('XPLG11');
      expect(semData?.textContent).not.toContain('HGLG11');
    });
  });

  it('deve exibir o gráfico de concentração por ticker', async () => {
    await setup();

    const grafico = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="concentration-chart"]',
    );

    expect(grafico?.querySelector('[data-testid="bar-chart"]')).toBeTruthy();
    expect(grafico?.querySelectorAll('[data-testid="bar"]').length).toBe(2);
    expect(grafico?.textContent).toContain('HGLG11');
    expect(grafico?.textContent).toContain('90,0%');
  });

  it('deve manter o total por ticker em bloco recolhível', async () => {
    await setup();

    const detalhe = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="ticker-details"]',
    );

    expect(detalhe?.tagName.toLowerCase()).toBe('details');
    expect(
      detalhe?.querySelectorAll('[data-testid="report-ticker-total-row"]')
        .length,
    ).toBe(2);
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

  it('não deve oferecer registro manual dos proventos do mês', async () => {
    // O registro passou a ser feito pelo sync diário de cotações (#112).
    await setup();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="record-monthly-button"]',
      ),
    ).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Recorte gratuito da projeção e da agenda (issue #262)
  // -------------------------------------------------------------------------
  describe('plano gratuito', () => {
    const item = (
      ticker: string,
      monthlyIncome: number,
      paymentDate?: string,
    ) => ({
      ticker,
      quantity: 10,
      monthlyDividend: monthlyIncome / 10,
      monthlyIncome,
      ...(paymentDate ? { paymentDate } : {}),
    });

    const comRecorte = async (
      resposta: Partial<MonthlyIncomeResponse> = {},
    ) => {
      dividendServiceMock.getMonthlyIncome.and.returnValue(
        of({
          byTicker: [
            item('AAAA11', 45, '2026-09-11'),
            item('BBBB11', 39.1, '2026-09-15'),
            item('CCCC11', 26.1, '2026-09-15'),
          ],
          scheduleItems: [
            item('BBBB11', 39.1, '2026-09-15'),
            item('CCCC11', 26.1, '2026-09-15'),
          ],
          total: 200,
          totalFromFridge: 0,
          scheduleTotals: { upcomingTotal: 0, paidTotal: 148.56 },
          limited: true,
          hiddenTickers: ['DDDD11', 'EEEE11'],
          hiddenPaymentDates: ['2026-08-25'],
          ...resposta,
        } as MonthlyIncomeResponse),
      );
      await setup();
      fixture.componentInstance.today.set(new Date(2026, 8, 17));
      fixture.detectChanges();
    };

    const el = (selector: string) =>
      (fixture.nativeElement as HTMLElement).querySelector(selector);

    it('deve avisar quantos ativos estão bloqueados na projeção', async () => {
      await comRecorte();

      const paywall = el('[data-testid="projections-paywall"]');

      expect(paywall).not.toBeNull();
      expect(paywall?.textContent).toContain('2');
      expect(el('[data-testid="projections-paywall-cta"]')).not.toBeNull();
    });

    it('deve avisar quantas datas estão bloqueadas na agenda', async () => {
      await comRecorte();

      const paywall = el('[data-testid="schedule-paywall"]');

      expect(paywall).not.toBeNull();
      expect(paywall?.textContent).toContain('1');
      expect(el('[data-testid="schedule-paywall-cta"]')).not.toBeNull();
    });

    it('deve montar a agenda a partir dos itens liberados', async () => {
      await comRecorte();

      const dias = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="schedule-day"]',
      );

      expect(dias.length).toBe(1);
      expect(dias[0].textContent).toContain('BBBB11');
      expect(dias[0].textContent).toContain('CCCC11');
      expect(dias[0].textContent).not.toContain('AAAA11');
    });

    it('deve exibir os totais completos da agenda', async () => {
      await comRecorte();

      expect(el('[data-testid="schedule-paid"]')?.textContent).toContain(
        '148,56',
      );
    });

    it('deve avisar sobre os ativos sem data anunciada bloqueados', async () => {
      // Sem o aviso, a seção "sem data de pagamento anunciada" simplesmente
      // desapareceria para quem não assina.
      await comRecorte({ hiddenScheduleTickers: ['ZZZZ11'] });

      expect(el('[data-testid="schedule-paywall"]')?.textContent).toContain(
        'sem data',
      );
    });

    it('deve exibir o total já pago mesmo sem data liberada no período', async () => {
      // As 2 datas liberadas podem cair todas no futuro; o total de pagos
      // continua real e precisa aparecer.
      await comRecorte({
        scheduleItems: [item('BBBB11', 39.1, '2026-09-20')],
        hiddenPaymentDates: ['2026-08-25', '2026-09-11'],
      });

      expect(el('[data-testid="schedule-paid"]')?.textContent).toContain(
        '148,56',
      );
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '[data-testid="schedule-paid"] [data-testid="schedule-day"]',
        ).length,
      ).toBe(0);
    });

    it('não deve exibir paywall quando nada foi bloqueado', async () => {
      await comRecorte({
        hiddenTickers: [],
        hiddenPaymentDates: [],
        scheduleItems: [
          item('AAAA11', 45, '2026-09-11'),
          item('BBBB11', 39.1, '2026-09-15'),
          item('CCCC11', 26.1, '2026-09-15'),
        ],
      });

      expect(el('[data-testid="projections-paywall"]')).toBeNull();
      expect(el('[data-testid="schedule-paywall"]')).toBeNull();
    });

    it('não deve exibir paywall para quem tem a projeção liberada', async () => {
      dividendServiceMock.getMonthlyIncome.and.returnValue(
        of({
          byTicker: [
            item('AAAA11', 45, '2026-09-11'),
            item('BBBB11', 39.1, '2026-09-15'),
            item('CCCC11', 26.1, '2026-09-15'),
            item('DDDD11', 10, '2026-08-25'),
          ],
          total: 120.2,
          totalFromFridge: 0,
          limited: false,
          hiddenTickers: [],
          hiddenPaymentDates: [],
        } as MonthlyIncomeResponse),
      );
      await setup();
      fixture.componentInstance.today.set(new Date(2026, 8, 17));
      fixture.detectChanges();

      expect(el('[data-testid="projections-paywall"]')).toBeNull();
      expect(el('[data-testid="schedule-paywall"]')).toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '[data-testid="ticker-card"]',
        ).length,
      ).toBe(4);
    });
  });
});
