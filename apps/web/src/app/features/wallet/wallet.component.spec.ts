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
import { FridgeService } from '../../core/services/fridge.service';
import { Wallet, Position, Fridge, FridgeItem } from 'dindin-models';

describe('WalletComponent', () => {
  let fixture: ComponentFixture<WalletComponent>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;
  let positionServiceMock: jasmine.SpyObj<PositionService>;
  let fridgeServiceMock: jasmine.SpyObj<FridgeService>;

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

    walletServiceMock.list.and.returnValue(of(wallets));
    positionServiceMock.list.and.returnValue(of(positions));
    fridgeServiceMock.listFridges.and.returnValue(of(fridges));

    await TestBed.configureTestingModule({
      imports: [WalletComponent],
      providers: [
        { provide: WalletService, useValue: walletServiceMock },
        { provide: PositionService, useValue: positionServiceMock },
        { provide: FridgeService, useValue: fridgeServiceMock },
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

      fixture.componentInstance.onEscapeKey();
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
});
