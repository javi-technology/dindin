import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { of, throwError, delay } from 'rxjs';
import { SetupService } from '../../core/services/setup.service';
import { WalletComponent } from './wallet.component';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { FridgeService } from '../../core/services/fridge.service';
import { AssetService } from '../../core/services/asset.service';
import { DividendService } from '../../core/services/dividend.service';
import { Wallet, Position, Asset, Fridge, FridgeItem } from 'dindin-models';

describe('WalletComponent', () => {
  let fixture: ComponentFixture<WalletComponent>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;
  let positionServiceMock: jasmine.SpyObj<PositionService>;
  let fridgeServiceMock: jasmine.SpyObj<FridgeService>;
  let assetServiceMock: jasmine.SpyObj<AssetService>;
  let dividendServiceMock: jasmine.SpyObj<DividendService>;
  let setupServiceMock: jasmine.SpyObj<SetupService>;

  const assets: Asset[] = [
    {
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      assetType: 'FII',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      ticker: 'KNRI11',
      name: 'Kinea Renda Imobiliária',
      assetType: 'FII',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      assetType: 'FII',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const wallets: Wallet[] = [
    {
      id: 'wallet-1',
      ownerId: 'user-123',
      name: 'Carteira Principal',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const fridges: Fridge[] = [
    {
      id: 'fridge-1',
      ownerId: 'user-123',
      name: 'Geladeira Principal',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const positions: Position[] = [
    {
      id: 'position-1',
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: 110.5,
      currentPrice: 112,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'position-2',
      walletId: 'wallet-1',
      ticker: 'KNRI11',
      assetType: 'FII',
      quantity: 5,
      averagePrice: 130,
      currentPrice: 132,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    walletServiceMock = jasmine.createSpyObj('WalletService', [
      'list',
      'create',
    ]);
    positionServiceMock = jasmine.createSpyObj('PositionService', [
      'list',
      'create',
      'update',
      'delete',
      'moveToFridge',
    ]);
    fridgeServiceMock = jasmine.createSpyObj('FridgeService', ['listFridges']);
    assetServiceMock = jasmine.createSpyObj('AssetService', ['list']);
    dividendServiceMock = jasmine.createSpyObj('DividendService', [
      'getDividendYield',
      'getMonthlyIncome',
    ]);
    setupServiceMock = jasmine.createSpyObj('SetupService', ['createDefault']);

    walletServiceMock.list.and.returnValue(of(wallets));
    positionServiceMock.list.and.returnValue(of(positions));
    fridgeServiceMock.listFridges.and.returnValue(of(fridges));
    assetServiceMock.list.and.returnValue(of(assets));
    dividendServiceMock.getDividendYield.and.returnValue(
      of({
        byTicker: [
          {
            ticker: 'HGLG11',
            annualIncome: 108,
            currentValue: 1120,
            yield: 9.64,
          },
          {
            ticker: 'KNRI11',
            annualIncome: 45,
            currentValue: 660,
            yield: 6.82,
          },
        ],
        total: {
          annualIncome: 153,
          currentValue: 1780,
          yield: 8.6,
        },
      }),
    );
    dividendServiceMock.getMonthlyIncome.and.returnValue(
      of({
        byTicker: [
          {
            ticker: 'HGLG11',
            quantity: 10,
            monthlyDividend: 0.9,
            monthlyIncome: 9,
          },
          {
            ticker: 'KNRI11',
            quantity: 5,
            monthlyDividend: 0.75,
            monthlyIncome: 3.75,
          },
        ],
        total: 12.75,
        totalFromFridge: 0,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [WalletComponent],
      providers: [
        { provide: WalletService, useValue: walletServiceMock },
        { provide: PositionService, useValue: positionServiceMock },
        { provide: FridgeService, useValue: fridgeServiceMock },
        { provide: AssetService, useValue: assetServiceMock },
        { provide: DividendService, useValue: dividendServiceMock },
        { provide: SetupService, useValue: setupServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('deve listar carteiras e selecionar a primeira', () => {
    expect(walletServiceMock.list).toHaveBeenCalled();
    expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-1');
  });

  it('deve exibir botão para criar carteira quando não houver carteiras', async () => {
    walletServiceMock.list.and.returnValue(of([]));
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const createButton = compiled.querySelector(
      '[data-testid="btn-criar-carteira"]',
    );
    expect(createButton).toBeTruthy();
  });

  it('deve criar carteira padrão ao clicar no botão', fakeAsync(() => {
    walletServiceMock.list.and.returnValues(of([]), of(wallets));
    setupServiceMock.createDefault.and.returnValue(
      of({ walletCreated: true, fridgeCreated: false }),
    );
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const createButton = compiled.querySelector(
      '[data-testid="btn-criar-carteira"]',
    ) as HTMLButtonElement;
    createButton.click();
    tick();
    fixture.detectChanges();

    // O nome padrão mora na API (#275): o front só pede o recurso.
    expect(setupServiceMock.createDefault).toHaveBeenCalledWith('wallet');
    expect(walletServiceMock.create).not.toHaveBeenCalled();
    expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-1');
  }));

  it('deve renderizar tabela com ticker, quantidade, preço atual e total', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent;
    expect(firstRow).toContain('HGLG11');
    expect(firstRow).toContain('10');
    // Exibe currentPrice (112,00) com indicador ▲ (maior que averagePrice 110,50)
    expect(firstRow).toMatch(/R\$\s?112,00/);
    expect(firstRow).toMatch(/R\$\s?1\.120,00/);
  });

  it('deve calcular e exibir o total geral', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const totalElement = compiled.querySelector('[data-testid="total-geral"]');
    // 10 * 112 + 5 * 132 = 1.780,00
    expect(totalElement?.textContent).toMatch(/R\$\s?1\.780,00/);
  });

  it('deve carregar dividend yield ao selecionar carteira', () => {
    expect(dividendServiceMock.getDividendYield).toHaveBeenCalledWith(
      'wallet-1',
    );
  });

  it('deve exibir coluna de proventos mensais para cada posição', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent;
    expect(firstRow).toMatch(/R\$\s?9,00/);

    const secondRow = rows[1].textContent;
    expect(secondRow).toMatch(/R\$\s?3,75/);
  });

  it('deve mostrar o último provento da Brapi como proventos/mês (#290)', () => {
    fixture.componentInstance.monthlyIncome.set({
      byTicker: [
        {
          ticker: 'HGLG11',
          quantity: 10,
          monthlyDividend: 12,
          monthlyIncome: 120,
        },
      ],
      total: 120,
      totalFromFridge: 0,
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    expect(row?.textContent).toMatch(/R\$\s?120,00/);
    expect(row?.querySelector('[data-testid="proventos-ultimo"]')).toBeNull();
    expect(compiled.querySelector('thead')?.textContent).not.toContain(
      'média dos últimos 12 meses',
    );
  });

  it('deve marcar como bloqueada a projeção recortada no plano gratuito', () => {
    // A API recorta `byTicker` sem o entitlement `projections` (#262): sem
    // isso a coluna mostraria R$ 0,00, que é número errado, não bloqueio.
    fixture.componentInstance.monthlyIncome.set({
      byTicker: [
        {
          ticker: 'HGLG11',
          quantity: 10,
          monthlyDividend: 0.9,
          monthlyIncome: 9,
        },
      ],
      total: 12.75,
      totalFromFridge: 0,
      limited: true,
      hiddenTickers: ['KNRI11'],
      hiddenPaymentDates: [],
    });
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody tr',
    );

    expect(rows[0].textContent).toMatch(/R\$\s?9,00/);
    expect(
      rows[1].querySelector('[data-testid="proventos-bloqueado"]'),
    ).not.toBeNull();
    expect(rows[1].textContent).not.toMatch(/R\$\s?0,00/);
  });

  it('deve exibir coluna de dividend yield para cada posição', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent;
    expect(firstRow).toContain('9,64%');

    const secondRow = rows[1].textContent;
    expect(secondRow).toContain('6,82%');
  });

  it('deve exibir total de proventos mensais no rodapé', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const totalElement = compiled.querySelector(
      '[data-testid="total-proventos"]',
    );
    expect(totalElement?.textContent).toMatch(/R\$\s?12,75/);
  });

  it('deve exibir dividend yield total consolidado', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const totalElement = compiled.querySelector('[data-testid="dy-total"]');
    expect(totalElement?.textContent).toContain('8,60%');
  });

  it('deve exibir mensagem de erro quando falha ao carregar dividend yield', fakeAsync(() => {
    dividendServiceMock.getDividendYield.and.returnValue(
      throwError(() => new Error('Network error')),
    );
    dividendServiceMock.getMonthlyIncome.and.returnValue(
      of({
        byTicker: [
          {
            ticker: 'HGLG11',
            quantity: 10,
            monthlyDividend: 0.9,
            monthlyIncome: 9,
          },
        ],
        total: 9,
        totalFromFridge: 0,
      }),
    );
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao carregar dividend yield.');
  }));

  it('deve limpar mensagem de erro após carregar dividend yield com sucesso', fakeAsync(() => {
    dividendServiceMock.getDividendYield.and.returnValues(
      throwError(() => new Error('Network error')),
      of({
        byTicker: [
          {
            ticker: 'HGLG11',
            annualIncome: 108,
            currentValue: 1120,
            yield: 9.64,
          },
        ],
        total: {
          annualIncome: 108,
          currentValue: 1120,
          yield: 9.64,
        },
      }),
    );
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    let errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao carregar dividend yield.');

    // Força recarregamento das posições para que o DY seja buscado novamente
    fixture.componentInstance.loadPositions('wallet-1');
    tick();
    fixture.detectChanges();

    errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl).toBeNull();
  }));

  it('deve ignorar resposta antiga de dividend yield ao trocar de carteira rapidamente', fakeAsync(() => {
    const wallet2: Wallet = {
      id: 'wallet-2',
      ownerId: 'user-123',
      name: 'Carteira Secundária',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const positions2: Position[] = [
      {
        id: 'position-3',
        walletId: 'wallet-2',
        ticker: 'MXRF11',
        assetType: 'FII',
        quantity: 100,
        averagePrice: 10,
        currentPrice: 10.5,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    walletServiceMock.list.and.returnValue(of([wallets[0], wallet2]));

    positionServiceMock.list.and.callFake((id: string) => {
      return id === 'wallet-1' ? of(positions) : of(positions2);
    });

    dividendServiceMock.getDividendYield.and.callFake((id: string) => {
      const response =
        id === 'wallet-1'
          ? {
              byTicker: [
                {
                  ticker: 'HGLG11',
                  annualIncome: 108,
                  currentValue: 1120,
                  yield: 9.64,
                },
              ],
              total: {
                annualIncome: 108,
                currentValue: 1120,
                yield: 9.64,
              },
            }
          : {
              byTicker: [
                {
                  ticker: 'MXRF11',
                  annualIncome: 120,
                  currentValue: 1050,
                  yield: 11.43,
                },
              ],
              total: {
                annualIncome: 120,
                currentValue: 1050,
                yield: 11.43,
              },
            };
      // Atraso para wallet-1 simular resposta lenta
      return of(response).pipe(delay(id === 'wallet-1' ? 100 : 0));
    });

    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    // Seleciona wallet-2 imediatamente
    fixture.componentInstance.selectWallet(wallet2);
    tick(150);
    fixture.detectChanges();

    expect(dividendServiceMock.getDividendYield).toHaveBeenCalledWith(
      'wallet-2',
    );
    expect(fixture.componentInstance.dividendYield()?.byTicker[0].ticker).toBe(
      'MXRF11',
    );
    expect(
      fixture.componentInstance.dividendYield()?.byTicker[0].yield,
    ).toBeCloseTo(11.43, 2);
  }));

  it('deve ignorar resposta antiga de posições ao trocar de carteira rapidamente', fakeAsync(() => {
    const wallet2: Wallet = {
      id: 'wallet-2',
      ownerId: 'user-123',
      name: 'Carteira Secundária',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const positions2: Position[] = [
      {
        id: 'position-3',
        walletId: 'wallet-2',
        ticker: 'MXRF11',
        assetType: 'FII',
        quantity: 100,
        averagePrice: 10,
        currentPrice: 10.5,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    walletServiceMock.list.and.returnValue(of([wallets[0], wallet2]));

    positionServiceMock.list.and.callFake((id: string) => {
      return of(id === 'wallet-1' ? positions : positions2).pipe(
        delay(id === 'wallet-1' ? 100 : 0),
      );
    });

    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    fixture.componentInstance.selectWallet(wallet2);
    tick(150);
    fixture.detectChanges();

    expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-2');
    expect(fixture.componentInstance.positions()[0].ticker).toBe('MXRF11');
  }));

  it('deve resetar loading quando requisição de posições é abortada', fakeAsync(() => {
    const wallet2: Wallet = {
      id: 'wallet-2',
      ownerId: 'user-123',
      name: 'Carteira Secundária',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const positions2: Position[] = [
      {
        id: 'position-3',
        walletId: 'wallet-2',
        ticker: 'MXRF11',
        assetType: 'FII',
        quantity: 100,
        averagePrice: 10,
        currentPrice: 10.5,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    walletServiceMock.list.and.returnValue(of([wallets[0], wallet2]));

    positionServiceMock.list.and.callFake((id: string) => {
      return of(id === 'wallet-1' ? positions : positions2).pipe(
        delay(id === 'wallet-1' ? 100 : 0),
      );
    });

    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBeFalse();

    fixture.componentInstance.selectWallet(wallet2);
    tick(50);
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBeFalse();
  }));

  it('deve exibir mensagem de erro no formulário quando falha ao carregar catálogo de ativos', fakeAsync(() => {
    assetServiceMock.list.and.returnValue(
      throwError(() => new Error('Network error')),
    );
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    fixture.componentInstance.openForm();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const assetsError = compiled.querySelector('[data-testid="assets-error"]');
    expect(assetsError?.textContent).toContain(
      'Erro ao carregar catálogo de ativos.',
    );
  }));

  it('deve abrir formulário ao clicar em adicionar posição', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const addButton = compiled.querySelector(
      '[data-testid="btn-adicionar"]',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = compiled.querySelector('[data-testid="position-form"]');
    expect(form).toBeTruthy();
  });

  it('deve abrir formulário preenchido ao clicar em editar', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const editButton = compiled.querySelector(
      '[data-testid="btn-editar-0"]',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();

    const tickerSelect = compiled.querySelector(
      'select#ticker',
    ) as HTMLSelectElement;
    expect(tickerSelect.value).toBe('HGLG11');
  });

  it('deve abrir modal de confirmação ao clicar em remover', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const deleteButton = compiled.querySelector(
      '[data-testid="btn-remover-0"]',
    ) as HTMLButtonElement;
    deleteButton.click();
    fixture.detectChanges();

    const modal = compiled.querySelector(
      '[data-testid="delete-confirm-modal"]',
    );
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('HGLG11');
  });

  it('deve chamar serviço de exclusão ao confirmar remoção no modal', fakeAsync(() => {
    positionServiceMock.delete.and.returnValue(of(undefined));
    positionServiceMock.list.and.returnValue(of(positions.slice(1)));

    const compiled = fixture.nativeElement as HTMLElement;
    const deleteButton = compiled.querySelector(
      '[data-testid="btn-remover-0"]',
    ) as HTMLButtonElement;
    deleteButton.click();
    tick();
    fixture.detectChanges();

    const confirmButton = compiled.querySelector(
      '[data-testid="delete-confirm-modal"] button.bg-red-600',
    ) as HTMLButtonElement;
    confirmButton.click();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.delete).toHaveBeenCalledWith(
      'wallet-1',
      'position-1',
    );
  }));

  it('deve fazer parse de preço com vírgula decimal', fakeAsync(() => {
    const newPosition: Position = {
      id: 'position-3',
      walletId: 'wallet-1',
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 1.55,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    positionServiceMock.create.and.returnValue(of(newPosition));
    positionServiceMock.list.and.returnValue(of([...positions, newPosition]));

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: '1,55',
    });
    fixture.componentInstance.savePosition();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.create).toHaveBeenCalledWith('wallet-1', {
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 1.55,
    });
  }));

  it('deve criar nova posição e recarregar lista', fakeAsync(() => {
    const newPosition: Position = {
      id: 'position-3',
      walletId: 'wallet-1',
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 9.8,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    positionServiceMock.create.and.returnValue(of(newPosition));
    positionServiceMock.list.and.returnValue(of([...positions, newPosition]));

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 9.8,
    });
    fixture.componentInstance.savePosition();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.create).toHaveBeenCalledWith('wallet-1', {
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 9.8,
    });
  }));

  it('deve exibir mensagem de erro quando falha ao carregar carteiras', fakeAsync(() => {
    walletServiceMock.list.and.returnValue(
      throwError(() => new Error('Network error')),
    );
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao carregar carteiras.');
  }));

  it('deve exibir mensagem de erro quando falha ao carregar posições', fakeAsync(() => {
    positionServiceMock.list.and.returnValue(
      throwError(() => new Error('Network error')),
    );
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao carregar posições.');
  }));

  it('deve exibir erro no formulário quando falha ao criar posição', fakeAsync(() => {
    positionServiceMock.create.and.returnValue(
      throwError(() => new Error('Server error')),
    );

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: '9,80',
    });
    fixture.componentInstance.savePosition();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const formError = compiled.querySelector('[data-testid="form-error"]');
    expect(formError?.textContent).toContain('Erro ao criar posição');
  }));

  it('deve exibir erro no formulário quando falha ao atualizar posição', fakeAsync(() => {
    positionServiceMock.update.and.returnValue(
      throwError(() => new Error('Server error')),
    );

    fixture.componentInstance.openForm(positions[0]);
    fixture.detectChanges();
    fixture.componentInstance.savePosition();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const formError = compiled.querySelector('[data-testid="form-error"]');
    expect(formError?.textContent).toContain('Erro ao atualizar posição');
  }));

  it('deve exibir mensagem de erro quando falha ao remover posição', fakeAsync(() => {
    positionServiceMock.delete.and.returnValue(
      throwError(() => new Error('Server error')),
    );

    fixture.componentInstance.deletePosition(positions[0]);
    fixture.detectChanges();
    fixture.componentInstance.confirmDelete();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao remover posição.');
  }));

  it('deve fechar formulário ao pressionar Esc', () => {
    fixture.componentInstance.openForm();
    fixture.detectChanges();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.formVisible()).toBeFalse();
  });

  it('deve fechar modal de exclusão ao pressionar Esc', () => {
    fixture.componentInstance.deletePosition(positions[0]);
    fixture.detectChanges();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.deleteConfirmPosition()).toBeNull();
  });

  it('deve rejeitar preço médio com formato inválido', () => {
    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({ averagePrice: 'abc' });
    fixture.componentInstance.form.get('averagePrice')?.markAsTouched();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.form
        .get('averagePrice')
        ?.hasError('invalidDecimal'),
    ).toBeTrue();
  });

  it('deve aceitar preço médio com vírgula como separador decimal', () => {
    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({ averagePrice: '110,50' });
    fixture.componentInstance.form.get('averagePrice')?.markAsTouched();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.form.get('averagePrice')?.valid,
    ).toBeTrue();
  });

  describe('moveToFridge', () => {
    it('deve exibir botão "Geladeira" em cada linha da tabela', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const fridgeButtons = compiled.querySelectorAll(
        '[data-testid^="btn-mover-geladeira-"]',
      );
      expect(fridgeButtons.length).toBe(2);
    });

    it('deve abrir modal de mover ao clicar no botão', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const fridgeButton = compiled.querySelector(
        '[data-testid="btn-mover-geladeira-0"]',
      ) as HTMLButtonElement;
      fridgeButton.click();
      fixture.detectChanges();

      const modal = compiled.querySelector(
        '[data-testid="mover-confirm-modal"]',
      );
      expect(modal).toBeTruthy();
      expect(modal?.textContent).toContain('HGLG11');
    });

    it('deve listar geladeiras no select do modal', () => {
      fixture.componentInstance.openMoveToFridge(positions[0]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const select = compiled.querySelector(
        '[data-testid="mover-fridge-select"]',
      ) as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.options.length).toBe(1);
      expect(select.options[0].textContent).toContain('Geladeira Principal');
    });

    it('deve chamar moveToFridge com dados corretos ao confirmar', fakeAsync(() => {
      const fridgeItem: FridgeItem = {
        id: 'new-fridge-item-id',
        fridgeId: 'fridge-1',
        ticker: 'HGLG11',
        quantity: 10,
        transferredPrice: 110.5,
        targetPrice: 120,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      positionServiceMock.moveToFridge.and.returnValue(of(fridgeItem));
      positionServiceMock.list.and.returnValue(of(positions.slice(1)));

      fixture.componentInstance.openMoveToFridge(positions[0]);
      fixture.componentInstance.moveToFridgeForm.patchValue({
        fridgeId: 'fridge-1',
        targetPrice: '120',
      });
      fixture.componentInstance.confirmMoveToFridge();
      tick();
      fixture.detectChanges();

      expect(positionServiceMock.moveToFridge).toHaveBeenCalledWith(
        'wallet-1',
        'position-1',
        { fridgeId: 'fridge-1', targetPrice: 120 },
      );
    }));

    it('deve recarregar posições após mover com sucesso', fakeAsync(() => {
      const fridgeItem: FridgeItem = {
        id: 'new-fridge-item-id',
        fridgeId: 'fridge-1',
        ticker: 'HGLG11',
        quantity: 10,
        transferredPrice: 110.5,
        targetPrice: 120,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      positionServiceMock.moveToFridge.and.returnValue(of(fridgeItem));
      positionServiceMock.list.and.returnValue(of(positions.slice(1)));

      fixture.componentInstance.openMoveToFridge(positions[0]);
      fixture.componentInstance.moveToFridgeForm.patchValue({
        fridgeId: 'fridge-1',
        targetPrice: '120',
      });
      fixture.componentInstance.confirmMoveToFridge();
      tick();
      fixture.detectChanges();

      expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-1');
      expect(fixture.componentInstance.moveToFridgePosition()).toBeNull();
    }));

    it('deve exibir erro no modal quando moveToFridge falha', fakeAsync(() => {
      positionServiceMock.moveToFridge.and.returnValue(
        throwError(() => new Error('Server error')),
      );

      fixture.componentInstance.openMoveToFridge(positions[0]);
      fixture.componentInstance.moveToFridgeForm.patchValue({
        fridgeId: 'fridge-1',
        targetPrice: '120',
      });
      fixture.componentInstance.confirmMoveToFridge();
      tick();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const errorEl = compiled.querySelector('[data-testid="mover-error"]');
      expect(errorEl?.textContent).toContain('Erro ao mover posição');
    }));

    it('deve fechar modal ao clicar em Cancelar', () => {
      fixture.componentInstance.openMoveToFridge(positions[0]);
      fixture.detectChanges();

      fixture.componentInstance.closeMoveToFridge();
      fixture.detectChanges();

      expect(fixture.componentInstance.moveToFridgePosition()).toBeNull();
    });

    it('deve fechar modal ao pressionar Esc', () => {
      fixture.componentInstance.openMoveToFridge(positions[0]);
      fixture.detectChanges();

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();

      expect(fixture.componentInstance.moveToFridgePosition()).toBeNull();
    });

    it('deve fazer parse de targetPrice com vírgula decimal', fakeAsync(() => {
      const fridgeItem: FridgeItem = {
        id: 'new-fridge-item-id',
        fridgeId: 'fridge-1',
        ticker: 'HGLG11',
        quantity: 10,
        transferredPrice: 110.5,
        targetPrice: 12.5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      positionServiceMock.moveToFridge.and.returnValue(of(fridgeItem));
      positionServiceMock.list.and.returnValue(of(positions.slice(1)));

      fixture.componentInstance.openMoveToFridge(positions[0]);
      fixture.componentInstance.moveToFridgeForm.patchValue({
        fridgeId: 'fridge-1',
        targetPrice: '12,50',
      });
      fixture.componentInstance.confirmMoveToFridge();
      tick();
      fixture.detectChanges();

      expect(positionServiceMock.moveToFridge).toHaveBeenCalledWith(
        'wallet-1',
        'position-1',
        { fridgeId: 'fridge-1', targetPrice: 12.5 },
      );
    }));
  });

  describe('variação de quantidade (+N/-N)', () => {
    const mxrf: Position = {
      id: 'position-mxrf',
      walletId: 'wallet-1',
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 32,
      averagePrice: 9.18,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const editWith = (values: Record<string, string>): void => {
      fixture.componentInstance.openForm(mxrf);
      fixture.componentInstance.form.patchValue(values);
      fixture.detectChanges();
    };

    beforeEach(() => {
      positionServiceMock.update.and.returnValue(of(mxrf));
    });

    it('deve aceitar texto no campo de quantidade', () => {
      editWith({ quantity: '+27' });
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        'input#quantity',
      ) as HTMLInputElement;
      expect(input.type).toBe('text');
      expect(input.value).toBe('+27');
    });

    it('deve somar +N à quantidade atual e manter o preço médio', fakeAsync(() => {
      editWith({ quantity: '+27' });
      fixture.componentInstance.savePosition();
      tick();

      expect(positionServiceMock.update).toHaveBeenCalledWith(
        'wallet-1',
        'position-mxrf',
        {
          ticker: 'MXRF11',
          assetType: 'FII',
          quantity: 59,
          averagePrice: 9.18,
        },
      );
    }));

    it('deve subtrair -N da quantidade atual sem alterar o preço médio', fakeAsync(() => {
      editWith({ quantity: '-10' });
      fixture.componentInstance.savePosition();
      tick();

      expect(positionServiceMock.update).toHaveBeenCalledWith(
        'wallet-1',
        'position-mxrf',
        jasmine.objectContaining({ quantity: 22, averagePrice: 9.18 }),
      );
    }));

    it('deve continuar aceitando o valor total', fakeAsync(() => {
      editWith({ quantity: '59' });
      fixture.componentInstance.savePosition();
      tick();

      expect(positionServiceMock.update).toHaveBeenCalledWith(
        'wallet-1',
        'position-mxrf',
        jasmine.objectContaining({ quantity: 59 }),
      );
    }));

    it('deve exibir o total resultante ao informar variação', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      editWith({ quantity: '+27' });
      expect(
        compiled.querySelector('[data-testid="quantity-preview"]')?.textContent,
      ).toContain('Total: 59');

      editWith({ quantity: '-10' });
      expect(
        compiled.querySelector('[data-testid="quantity-preview"]')?.textContent,
      ).toContain('Total: 22');

      editWith({ quantity: '59' });
      expect(
        compiled.querySelector('[data-testid="quantity-preview"]'),
      ).toBeNull();
    });

    it('deve exibir o campo de preço da compra apenas ao somar', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      editWith({ quantity: '+27' });
      expect(compiled.querySelector('input#purchasePrice')).toBeTruthy();

      editWith({ quantity: '-10' });
      expect(compiled.querySelector('input#purchasePrice')).toBeNull();

      editWith({ quantity: '59' });
      expect(compiled.querySelector('input#purchasePrice')).toBeNull();
    });

    it('deve recalcular o preço médio com o preço da compra', fakeAsync(() => {
      editWith({ quantity: '+27', purchasePrice: '9,45' });
      expect(
        parseFloat(fixture.componentInstance.form.value.averagePrice),
      ).toBe(9.3);

      fixture.componentInstance.savePosition();
      tick();

      expect(positionServiceMock.update).toHaveBeenCalledWith(
        'wallet-1',
        'position-mxrf',
        jasmine.objectContaining({ quantity: 59, averagePrice: 9.3 }),
      );
    }));

    it('deve restaurar o preço médio ao limpar o preço da compra', () => {
      editWith({ quantity: '+27', purchasePrice: '9,45' });
      fixture.componentInstance.form.patchValue({ purchasePrice: '' });
      expect(fixture.componentInstance.form.value.averagePrice).toBe('9.18');
    });

    it('deve restaurar o preço médio ao deixar de somar', () => {
      editWith({ quantity: '+27', purchasePrice: '9,45' });
      fixture.componentInstance.form.patchValue({ quantity: '-10' });
      expect(fixture.componentInstance.form.value.averagePrice).toBe('9.18');
    });

    it('não deve salvar quando o resultado não for maior que zero', fakeAsync(() => {
      editWith({ quantity: '-32' });
      expect(
        fixture.componentInstance.form.get('quantity')?.invalid,
      ).toBeTrue();

      fixture.componentInstance.savePosition();
      tick();

      expect(positionServiceMock.update).not.toHaveBeenCalled();
    }));

    it('não deve salvar entrada inválida', fakeAsync(() => {
      editWith({ quantity: '+abc' });
      fixture.componentInstance.savePosition();
      tick();

      expect(positionServiceMock.update).not.toHaveBeenCalled();
    }));

    it('deve tratar +N como total na criação de posição', fakeAsync(() => {
      positionServiceMock.create.and.returnValue(of(mxrf));
      fixture.componentInstance.openForm();
      fixture.componentInstance.form.patchValue({
        ticker: 'MXRF11',
        assetType: 'FII',
        quantity: '+15',
        purchasePrice: '9,80',
      });
      fixture.componentInstance.savePosition();
      tick();

      expect(positionServiceMock.create).toHaveBeenCalledWith('wallet-1', {
        ticker: 'MXRF11',
        assetType: 'FII',
        quantity: 15,
        averagePrice: 9.8,
      });
    }));

    it('deve rejeitar -N na criação de posição', () => {
      fixture.componentInstance.openForm();
      fixture.componentInstance.form.patchValue({ quantity: '-5' });
      expect(
        fixture.componentInstance.form.get('quantity')?.invalid,
      ).toBeTrue();
    });
  });

  // -------------------------------------------------------------------------
  // Cancelamento de requisição em voo (issue #224)
  //
  // Trocar de carteira com uma requisição pendente descarta a resposta antiga,
  // para que dados da carteira anterior não sobrescrevam os da nova. Esse
  // comportamento existia via Subjects de abort, mas não tinha teste — o que
  // tornava arriscado trocar o mecanismo por switchMap.
  // -------------------------------------------------------------------------
  describe('troca de carteira com requisição pendente', () => {
    const duasCarteiras: Wallet[] = [
      wallets[0],
      {
        id: 'wallet-2',
        ownerId: 'user-123',
        name: 'Carteira Secundária',
        currency: 'BRL',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const posicaoDaSegunda: Position[] = [
      {
        ...positions[0],
        id: 'position-da-wallet-2',
        walletId: 'wallet-2',
        ticker: 'MXRF11',
      },
    ];

    it('deve descartar a resposta obsoleta da carteira anterior', fakeAsync(() => {
      walletServiceMock.list.and.returnValue(of(duasCarteiras));
      // A primeira carteira responde devagar; a segunda, na hora.
      positionServiceMock.list.and.callFake((walletId: string) =>
        walletId === 'wallet-1'
          ? of(positions).pipe(delay(500))
          : of(posicaoDaSegunda),
      );

      fixture = TestBed.createComponent(WalletComponent);
      fixture.detectChanges();
      tick();

      const component = fixture.componentInstance;
      component.selectWallet(duasCarteiras[1]);
      tick();

      expect(component.positions().map((p) => p.id)).toEqual([
        'position-da-wallet-2',
      ]);

      // A resposta atrasada da wallet-1 chega depois e deve ser ignorada.
      tick(600);

      expect(component.positions().map((p) => p.id)).toEqual([
        'position-da-wallet-2',
      ]);
      expect(component.selectedWallet()?.id).toBe('wallet-2');
    }));

    it('deve encerrar o carregamento após a troca', fakeAsync(() => {
      walletServiceMock.list.and.returnValue(of(duasCarteiras));
      positionServiceMock.list.and.callFake((walletId: string) =>
        walletId === 'wallet-1'
          ? of(positions).pipe(delay(500))
          : of(posicaoDaSegunda),
      );

      fixture = TestBed.createComponent(WalletComponent);
      fixture.detectChanges();
      tick();

      fixture.componentInstance.selectWallet(duasCarteiras[1]);
      tick(600);

      expect(fixture.componentInstance.loading()).toBe(false);
    }));
  });

  // -------------------------------------------------------------------------
  // Ordenação por coluna da tabela de posições (issue #274)
  // -------------------------------------------------------------------------
  describe('ordenação da tabela', () => {
    const position = (
      id: string,
      ticker: string,
      quantity: number,
      currentPrice?: number,
    ): Position => ({
      id,
      walletId: 'wallet-1',
      ticker,
      assetType: 'FII',
      quantity,
      averagePrice: 10,
      ...(currentPrice === undefined ? {} : { currentPrice }),
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const income = (ticker: string, monthlyIncome: number) => ({
      ticker,
      quantity: 1,
      monthlyDividend: monthlyIncome,
      monthlyIncome,
    });
    const dy = (ticker: string, value: number) => ({
      ticker,
      annualIncome: 0,
      currentValue: 0,
      yield: value,
    });

    const tickers = (): string[] =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
      ).map((row) => row.querySelector('td')?.textContent?.trim() ?? '');
    const header = (column: string): HTMLElement =>
      (fixture.nativeElement as HTMLElement).querySelector(
        `th[data-sort-column="${column}"]`,
      ) as HTMLElement;
    const sortBy = (column: string): void => {
      header(column).querySelector('button')!.click();
      fixture.detectChanges();
    };

    beforeEach(() => {
      const component = fixture.componentInstance;
      // KNRI11 sem cotação: a tabela mostra o preço médio.
      component.positions.set([
        position('p1', 'XPML11', 10, 100),
        position('p2', 'BTLG11', 30, 50),
        position('p3', 'KNRI11', 5),
      ]);
      component.monthlyIncome.set({
        byTicker: [
          income('XPML11', 8),
          income('BTLG11', 8),
          income('KNRI11', 2),
        ],
        total: 18,
        totalFromFridge: 0,
      });
      component.dividendYield.set({
        byTicker: [dy('XPML11', 9), dy('BTLG11', 7), dy('KNRI11', 11)],
        total: { annualIncome: 0, currentValue: 0, yield: 8 },
      });
      fixture.detectChanges();
    });

    it('deve ordenar por Ticker crescente ao abrir a tela', () => {
      expect(tickers()).toEqual(['BTLG11', 'KNRI11', 'XPML11']);
      expect(header('ticker').getAttribute('aria-sort')).toBe('ascending');
      for (const column of [
        'quantity',
        'currentPrice',
        'total',
        'monthlyIncome',
        'dividendYield',
      ]) {
        expect(header(column).getAttribute('aria-sort')).toBe('none');
      }
    });

    it('não deve tornar a coluna Ações ordenável', () => {
      const headers = (fixture.nativeElement as HTMLElement).querySelectorAll(
        'thead th',
      );
      const acoes = headers[headers.length - 1];
      expect(acoes.textContent).toContain('Ações');
      expect(acoes.hasAttribute('aria-sort')).toBeFalse();
      expect(acoes.querySelector('button')).toBeNull();
    });

    it('deve alternar entre crescente e decrescente na mesma coluna', () => {
      sortBy('ticker');
      expect(tickers()).toEqual(['XPML11', 'KNRI11', 'BTLG11']);
      expect(header('ticker').getAttribute('aria-sort')).toBe('descending');

      sortBy('ticker');
      expect(tickers()).toEqual(['BTLG11', 'KNRI11', 'XPML11']);
      expect(header('ticker').getAttribute('aria-sort')).toBe('ascending');
    });

    it('deve passar a ordenar outra coluna em ordem crescente', () => {
      sortBy('ticker'); // desc
      sortBy('quantity');

      expect(tickers()).toEqual(['KNRI11', 'XPML11', 'BTLG11']);
      expect(header('quantity').getAttribute('aria-sort')).toBe('ascending');
      expect(header('ticker').getAttribute('aria-sort')).toBe('none');
    });

    it('deve ordenar Preço atual e Total pelo valor exibido', () => {
      // KNRI11 sem cotação aparece com o preço médio (R$ 10) e total R$ 50:
      // a ordem tem de seguir o que a tabela mostra.
      sortBy('total');
      expect(tickers()).toEqual(['KNRI11', 'XPML11', 'BTLG11']);

      sortBy('total');
      expect(tickers()).toEqual(['BTLG11', 'XPML11', 'KNRI11']);

      sortBy('currentPrice');
      expect(tickers()).toEqual(['KNRI11', 'BTLG11', 'XPML11']);

      sortBy('currentPrice');
      expect(tickers()).toEqual(['XPML11', 'BTLG11', 'KNRI11']);
    });

    it('deve desempatar pelo Ticker em ordem alfabética', () => {
      sortBy('monthlyIncome');
      expect(tickers()).toEqual(['KNRI11', 'BTLG11', 'XPML11']);

      sortBy('monthlyIncome');
      expect(tickers()).toEqual(['BTLG11', 'XPML11', 'KNRI11']);
    });

    it('deve ordenar por DY com o valor exibido', () => {
      sortBy('dividendYield');
      expect(tickers()).toEqual(['BTLG11', 'XPML11', 'KNRI11']);
    });

    it('deve levar ao fim a projeção bloqueada no plano gratuito', () => {
      fixture.componentInstance.monthlyIncome.set({
        byTicker: [income('XPML11', 8), income('BTLG11', 3)],
        total: 18,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: ['KNRI11'],
        hiddenPaymentDates: [],
      });
      sortBy('monthlyIncome');
      expect(tickers()).toEqual(['BTLG11', 'XPML11', 'KNRI11']);

      sortBy('monthlyIncome');
      expect(tickers()).toEqual(['XPML11', 'BTLG11', 'KNRI11']);
    });

    it('não deve alterar a linha de totais', () => {
      const tfoot = (): string =>
        (fixture.nativeElement as HTMLElement).querySelector('tfoot')
          ?.textContent ?? '';
      const before = tfoot();

      sortBy('total');
      sortBy('total');

      expect(tfoot()).toBe(before);
    });

    it('deve manter a ordenação escolhida ao trocar de carteira', () => {
      sortBy('total');
      sortBy('total');

      fixture.componentInstance.selectWallet({
        ...wallets[0],
        id: 'wallet-2',
        name: 'Outra',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.sort()).toEqual({
        column: 'total',
        direction: 'desc',
      });
      expect(header('total').getAttribute('aria-sort')).toBe('descending');
    });
  });
});
