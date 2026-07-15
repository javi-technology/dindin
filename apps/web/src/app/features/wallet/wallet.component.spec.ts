import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { WalletComponent } from './wallet.component';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { Wallet, Position } from 'dindin-models';

describe('WalletComponent', () => {
  let fixture: ComponentFixture<WalletComponent>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;
  let positionServiceMock: jasmine.SpyObj<PositionService>;

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
    ]);

    walletServiceMock.list.and.returnValue(of(wallets));
    positionServiceMock.list.and.returnValue(of(positions));

    await TestBed.configureTestingModule({
      imports: [WalletComponent],
      providers: [
        { provide: WalletService, useValue: walletServiceMock },
        { provide: PositionService, useValue: positionServiceMock },
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
    walletServiceMock.list.and.returnValue(of([]));
    walletServiceMock.create.and.returnValue(of(wallets[0]));
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

    expect(walletServiceMock.create).toHaveBeenCalledWith({
      name: 'Carteira Principal',
      currency: 'BRL',
    });
    expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-1');
  }));

  it('deve renderizar tabela com ticker, quantidade, valor unitário e total', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent;
    expect(firstRow).toContain('HGLG11');
    expect(firstRow).toContain('10');
    expect(firstRow).toMatch(/R\$\s?110,50/);
    expect(firstRow).toMatch(/R\$\s?1\.105,00/);
  });

  it('deve calcular e exibir o total geral', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const totalElement = compiled.querySelector('[data-testid="total-geral"]');
    expect(totalElement?.textContent).toMatch(/R\$\s?1\.755,00/);
  });

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

    const tickerInput = compiled.querySelector(
      'input#ticker',
    ) as HTMLInputElement;
    expect(tickerInput.value).toBe('HGLG11');
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
      currentPrice: 10,
    });
    fixture.componentInstance.savePosition();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.create).toHaveBeenCalledWith('wallet-1', {
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 9.8,
      currentPrice: 10,
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

    fixture.componentInstance.onEscapeKey();
    fixture.detectChanges();

    expect(fixture.componentInstance.formVisible()).toBeFalse();
  });

  it('deve fechar modal de exclusão ao pressionar Esc', () => {
    fixture.componentInstance.deletePosition(positions[0]);
    fixture.detectChanges();

    fixture.componentInstance.onEscapeKey();
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

  // --- Geladeira (toggle, gelar, desgelar, potencial) ---

  it('deve exibir toggle de geladeira', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const toggle = compiled.querySelector('[data-testid="toggle-geladeira"]');
    expect(toggle).toBeTruthy();
  });

  it('deve filtrar posições da geladeira ao ativar o toggle', () => {
    const fridgePositions: Position[] = [
      {
        ...positions[0],
        id: 'pos-fridge',
        ticker: 'FRIDGE11',
        inFridge: true,
        targetPrice: 100,
      },
    ];
    positionServiceMock.list.and.returnValue(
      of([...positions, ...fridgePositions]),
    );
    fixture.componentInstance.loadPositions('wallet-1');
    fixture.detectChanges();

    // Antes do toggle: mostra todas
    let rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody tr',
    );
    expect(rows.length).toBe(3);

    // Ativa toggle geladeira
    fixture.componentInstance.toggleFridge();
    fixture.detectChanges();

    rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('FRIDGE11');
  });

  it('deve exibir botão "Gelar" para posições não geladas', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const gelarBtn = compiled.querySelector('[data-testid="btn-gelar-0"]');
    expect(gelarBtn).toBeTruthy();
    expect(gelarBtn?.textContent).toContain('Gelar');
  });

  it('deve abrir modal de gelar ao clicar em "Gelar"', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const gelarBtn = compiled.querySelector(
      '[data-testid="btn-gelar-0"]',
    ) as HTMLButtonElement;
    gelarBtn.click();
    fixture.detectChanges();

    const modal = compiled.querySelector('[data-testid="fridge-form"]');
    expect(modal).toBeTruthy();
  });

  it('deve chamar update com inFringe=true e targetPrice ao gelar', fakeAsync(() => {
    positionServiceMock.update.and.returnValue(
      of({ ...positions[0], inFridge: true, targetPrice: 100 }),
    );
    positionServiceMock.list.and.returnValue(of(positions));

    fixture.componentInstance.openFridgeForm(positions[0]);
    fixture.componentInstance.fridgeForm.patchValue({ targetPrice: '100,00' });
    fixture.componentInstance.saveFridge();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.update).toHaveBeenCalledWith(
      'wallet-1',
      'position-1',
      {
        inFridge: true,
        targetPrice: 100,
      },
    );
  }));

  it('deve exibir botão "Desgelar" para posições geladas', () => {
    const fridgePosition: Position = {
      ...positions[0],
      inFridge: true,
      targetPrice: 100,
    };
    positionServiceMock.list.and.returnValue(of([fridgePosition]));
    fixture.componentInstance.loadPositions('wallet-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const desgelarBtn = compiled.querySelector(
      '[data-testid="btn-desgelar-0"]',
    );
    expect(desgelarBtn).toBeTruthy();
    expect(desgelarBtn?.textContent).toContain('Desgelar');
  });

  it('deve chamar update com inFridge=false ao desgelar', fakeAsync(() => {
    const fridgePosition: Position = {
      ...positions[0],
      inFridge: true,
      targetPrice: 100,
    };
    positionServiceMock.list.and.returnValue(of([fridgePosition]));
    fixture.componentInstance.loadPositions('wallet-1');
    fixture.detectChanges();

    positionServiceMock.update.and.returnValue(
      of({ ...fridgePosition, inFridge: false }),
    );
    positionServiceMock.list.and.returnValue(of([positions[0]]));

    const compiled = fixture.nativeElement as HTMLElement;
    const desgelarBtn = compiled.querySelector(
      '[data-testid="btn-desgelar-0"]',
    ) as HTMLButtonElement;
    desgelarBtn.click();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.update).toHaveBeenCalledWith(
      'wallet-1',
      'position-1',
      {
        inFridge: false,
        targetPrice: null,
      },
    );
  }));

  it('deve calcular e exibir potencial de ganho para posição gelada', () => {
    const fridgePosition: Position = {
      ...positions[0],
      inFridge: true,
      targetPrice: 120,
      currentPrice: 100,
    };
    positionServiceMock.list.and.returnValue(of([fridgePosition]));
    fixture.componentInstance.loadPositions('wallet-1');
    fixture.componentInstance.toggleFridge();
    fixture.detectChanges();

    // potencial = (120 - 100) / 100 * 100 = 20,00%
    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    expect(row?.textContent).toMatch(/20,00\s?%/);
  });

  it('deve usar averagePrice como fallback quando currentPrice ausente', () => {
    const fridgePosition: Position = {
      ...positions[0],
      inFridge: true,
      targetPrice: 132.6,
      currentPrice: undefined,
      averagePrice: 110.5,
    };
    positionServiceMock.list.and.returnValue(of([fridgePosition]));
    fixture.componentInstance.loadPositions('wallet-1');
    fixture.componentInstance.toggleFridge();
    fixture.detectChanges();

    // potencial = (132.6 - 110.5) / 110.5 * 100 = 20,00%
    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    expect(row?.textContent).toMatch(/20,00\s?%/);
  });

  it('deve exibir "—" quando targetPrice ou base ausentes', () => {
    const fridgePosition: Position = {
      ...positions[0],
      inFridge: true,
      targetPrice: undefined,
      currentPrice: undefined,
      averagePrice: 0,
    };
    positionServiceMock.list.and.returnValue(of([fridgePosition]));
    fixture.componentInstance.loadPositions('wallet-1');
    fixture.componentInstance.toggleFridge();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    expect(row?.textContent).toContain('—');
  });

  it('deve fechar modal de gelar ao pressionar Esc', () => {
    fixture.componentInstance.openFridgeForm(positions[0]);
    fixture.detectChanges();

    fixture.componentInstance.onEscapeKey();
    fixture.detectChanges();

    expect(fixture.componentInstance.fridgeFormVisible()).toBeFalse();
  });

  it('deve rejeitar preço-alvo da geladeira com formato inválido', () => {
    fixture.componentInstance.openFridgeForm(positions[0]);
    fixture.componentInstance.fridgeForm.patchValue({ targetPrice: 'abc' });
    fixture.componentInstance.fridgeForm.get('targetPrice')?.markAsTouched();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.fridgeForm
        .get('targetPrice')
        ?.hasError('invalidDecimal'),
    ).toBeTrue();
  });
});
