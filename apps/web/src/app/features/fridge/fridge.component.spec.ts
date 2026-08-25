import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { FridgeComponent } from './fridge.component';
import { FridgeService } from '../../core/services/fridge.service';
import { AssetService } from '../../core/services/asset.service';
import { Asset, Fridge, FridgeItem } from 'dindin-models';

describe('FridgeComponent', () => {
  let fixture: ComponentFixture<FridgeComponent>;
  let fridgeServiceMock: jasmine.SpyObj<FridgeService>;
  let assetServiceMock: jasmine.SpyObj<AssetService>;

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
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      assetType: 'FII',
      active: true,
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

  const items: FridgeItem[] = [
    {
      id: 'item-1',
      fridgeId: 'fridge-1',
      ticker: 'HGLG11',
      quantity: 10,
      transferredPrice: 110.5,
      targetPrice: 120,
      currentPrice: 112,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'item-2',
      fridgeId: 'fridge-1',
      ticker: 'KNRI11',
      quantity: 5,
      transferredPrice: 130,
      targetPrice: 145,
      currentPrice: 132,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    fridgeServiceMock = jasmine.createSpyObj('FridgeService', [
      'listFridges',
      'createFridge',
      'listItems',
      'createItem',
      'updateItem',
      'deleteItem',
    ]);

    fridgeServiceMock.listFridges.and.returnValue(of(fridges));
    fridgeServiceMock.listItems.and.returnValue(of(items));

    assetServiceMock = jasmine.createSpyObj('AssetService', ['list']);
    assetServiceMock.list.and.returnValue(of(assets));

    await TestBed.configureTestingModule({
      imports: [FridgeComponent],
      providers: [
        { provide: FridgeService, useValue: fridgeServiceMock },
        { provide: AssetService, useValue: assetServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    fixture.detectChanges();
  });

  it('deve listar geladeiras e selecionar a primeira', () => {
    expect(fridgeServiceMock.listFridges).toHaveBeenCalled();
    expect(fridgeServiceMock.listItems).toHaveBeenCalledWith('fridge-1');
  });

  it('deve exibir botão para criar geladeira quando não houver geladeiras', async () => {
    fridgeServiceMock.listFridges.and.returnValue(of([]));
    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const createButton = compiled.querySelector(
      '[data-testid="btn-criar-geladeira"]',
    );
    expect(createButton).toBeTruthy();
  });

  it('deve criar geladeira padrão ao clicar no botão', fakeAsync(() => {
    fridgeServiceMock.listFridges.and.returnValue(of([]));
    fridgeServiceMock.createFridge.and.returnValue(of(fridges[0]));
    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const createButton = compiled.querySelector(
      '[data-testid="btn-criar-geladeira"]',
    ) as HTMLButtonElement;
    createButton.click();
    tick();
    fixture.detectChanges();

    expect(fridgeServiceMock.createFridge).toHaveBeenCalledWith({
      name: 'Geladeira Principal',
    });
    expect(fridgeServiceMock.listItems).toHaveBeenCalledWith('fridge-1');
  }));

  it('deve renderizar tabela com ticker, quantidade, preço atual, preço-alvo e potencial', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent;
    expect(firstRow).toContain('HGLG11');
    expect(firstRow).toContain('10');
    // currentPrice (112) é exibido quando disponível, não transferredPrice
    expect(firstRow).toMatch(/R\$\s?112,00/);
    expect(firstRow).toMatch(/R\$\s?120,00/);
    // potencial = (120 - 112) / 112 * 100 = 7,14%
    expect(firstRow).toMatch(/7,14\s?%/);
  });

  it('deve usar transferredPrice como fallback quando currentPrice ausente', () => {
    const itemsWithoutCurrent: FridgeItem[] = [
      {
        ...items[0],
        currentPrice: undefined,
        transferredPrice: 110.5,
        targetPrice: 132.6,
      },
    ];
    fridgeServiceMock.listItems.and.returnValue(of(itemsWithoutCurrent));
    fixture.componentInstance.loadItems('fridge-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    // potencial = (132.6 - 110.5) / 110.5 * 100 = 20,00%
    expect(row?.textContent).toMatch(/20,00\s?%/);
  });

  it('deve exibir "—" quando targetPrice ou base ausentes', () => {
    const itemsWithoutTarget: FridgeItem[] = [
      {
        ...items[0],
        targetPrice: 0,
        currentPrice: undefined,
        transferredPrice: 0,
      },
    ];
    fridgeServiceMock.listItems.and.returnValue(of(itemsWithoutTarget));
    fixture.componentInstance.loadItems('fridge-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    expect(row?.textContent).toContain('—');
  });

  it('deve exibir mensagem de erro no formulário quando falha ao carregar catálogo de ativos', fakeAsync(() => {
    assetServiceMock.list.and.returnValue(
      throwError(() => new Error('Network error')),
    );
    fixture = TestBed.createComponent(FridgeComponent);
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

  it('deve abrir formulário ao clicar em adicionar item', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const addButton = compiled.querySelector(
      '[data-testid="btn-adicionar-item"]',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = compiled.querySelector('[data-testid="item-form"]');
    expect(form).toBeTruthy();
  });

  it('deve abrir formulário preenchido ao clicar em editar', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const editButton = compiled.querySelector(
      '[data-testid="btn-editar-item-0"]',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();

    const tickerSelect = compiled.querySelector(
      'select#item-ticker',
    ) as HTMLSelectElement;
    expect(tickerSelect.value).toBe('HGLG11');
  });

  it('deve abrir modal de confirmação ao clicar em remover', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const deleteButton = compiled.querySelector(
      '[data-testid="btn-remover-item-0"]',
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
    fridgeServiceMock.deleteItem.and.returnValue(of(undefined));
    fridgeServiceMock.listItems.and.returnValue(of(items.slice(1)));

    const compiled = fixture.nativeElement as HTMLElement;
    const deleteButton = compiled.querySelector(
      '[data-testid="btn-remover-item-0"]',
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

    expect(fridgeServiceMock.deleteItem).toHaveBeenCalledWith(
      'fridge-1',
      'item-1',
    );
  }));

  it('deve fazer parse de preço com vírgula decimal', fakeAsync(() => {
    const newItem: FridgeItem = {
      id: 'item-3',
      fridgeId: 'fridge-1',
      ticker: 'MXRF11',
      quantity: 15,
      transferredPrice: 1.55,
      targetPrice: 2.0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    fridgeServiceMock.createItem.and.returnValue(of(newItem));
    fridgeServiceMock.listItems.and.returnValue(of([...items, newItem]));

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      quantity: 15,
      transferredPrice: '1,55',
      targetPrice: '2,00',
    });
    fixture.componentInstance.saveItem();
    tick();
    fixture.detectChanges();

    expect(fridgeServiceMock.createItem).toHaveBeenCalledWith('fridge-1', {
      ticker: 'MXRF11',
      quantity: 15,
      transferredPrice: 1.55,
      targetPrice: 2.0,
    });
  }));

  it('deve criar novo item e recarregar lista', fakeAsync(() => {
    const newItem: FridgeItem = {
      id: 'item-3',
      fridgeId: 'fridge-1',
      ticker: 'MXRF11',
      quantity: 15,
      transferredPrice: 9.8,
      targetPrice: 12,
      currentPrice: 10,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    fridgeServiceMock.createItem.and.returnValue(of(newItem));
    fridgeServiceMock.listItems.and.returnValue(of([...items, newItem]));

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      quantity: 15,
      transferredPrice: '9,80',
      targetPrice: '12,00',
    });
    fixture.componentInstance.saveItem();
    tick();
    fixture.detectChanges();

    expect(fridgeServiceMock.createItem).toHaveBeenCalledWith('fridge-1', {
      ticker: 'MXRF11',
      quantity: 15,
      transferredPrice: 9.8,
      targetPrice: 12,
    });
  }));

  it('deve atualizar item e recarregar lista', fakeAsync(() => {
    fridgeServiceMock.updateItem.and.returnValue(
      of({ ...items[0], targetPrice: 130 }),
    );
    fridgeServiceMock.listItems.and.returnValue(
      of([{ ...items[0], targetPrice: 130 }, items[1]]),
    );

    fixture.componentInstance.openForm(items[0]);
    fixture.componentInstance.form.patchValue({ targetPrice: '130,00' });
    fixture.componentInstance.saveItem();
    tick();
    fixture.detectChanges();

    expect(fridgeServiceMock.updateItem).toHaveBeenCalledWith(
      'fridge-1',
      'item-1',
      {
        ticker: 'HGLG11',
        quantity: 10,
        transferredPrice: 110.5,
        targetPrice: 130,
      },
    );
  }));

  it('deve exibir mensagem de erro quando falha ao carregar geladeiras', fakeAsync(() => {
    fridgeServiceMock.listFridges.and.returnValue(
      throwError(() => new Error('Network error')),
    );
    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao carregar geladeiras.');
  }));

  it('deve exibir mensagem de erro quando falha ao carregar itens', fakeAsync(() => {
    fridgeServiceMock.listItems.and.returnValue(
      throwError(() => new Error('Network error')),
    );
    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao carregar itens.');
  }));

  it('deve exibir erro no formulário quando falha ao criar item', fakeAsync(() => {
    fridgeServiceMock.createItem.and.returnValue(
      throwError(() => new Error('Server error')),
    );

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      quantity: 10,
      transferredPrice: '9,80',
      targetPrice: '12,00',
    });
    fixture.componentInstance.saveItem();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const formError = compiled.querySelector('[data-testid="form-error"]');
    expect(formError?.textContent).toContain('Erro ao criar item');
  }));

  it('deve exibir erro no formulário quando falha ao atualizar item', fakeAsync(() => {
    fridgeServiceMock.updateItem.and.returnValue(
      throwError(() => new Error('Server error')),
    );

    fixture.componentInstance.openForm(items[0]);
    fixture.detectChanges();
    fixture.componentInstance.saveItem();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const formError = compiled.querySelector('[data-testid="form-error"]');
    expect(formError?.textContent).toContain('Erro ao atualizar item');
  }));

  it('deve exibir mensagem de erro quando falha ao remover item', fakeAsync(() => {
    fridgeServiceMock.deleteItem.and.returnValue(
      throwError(() => new Error('Server error')),
    );

    fixture.componentInstance.deleteItem(items[0]);
    fixture.detectChanges();
    fixture.componentInstance.confirmDelete();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao remover item.');
  }));

  it('deve fechar formulário ao pressionar Esc', () => {
    fixture.componentInstance.openForm();
    fixture.detectChanges();

    fixture.componentInstance.onEscapeKey();
    fixture.detectChanges();

    expect(fixture.componentInstance.formVisible()).toBeFalse();
  });

  it('deve fechar modal de exclusão ao pressionar Esc', () => {
    fixture.componentInstance.deleteItem(items[0]);
    fixture.detectChanges();

    fixture.componentInstance.onEscapeKey();
    fixture.detectChanges();

    expect(fixture.componentInstance.deleteConfirmItem()).toBeNull();
  });

  it('deve rejeitar preço com formato inválido', () => {
    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({ transferredPrice: 'abc' });
    fixture.componentInstance.form.get('transferredPrice')?.markAsTouched();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.form
        .get('transferredPrice')
        ?.hasError('invalidDecimal'),
    ).toBeTrue();
  });

  it('deve aceitar preço com vírgula como separador decimal', () => {
    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({ transferredPrice: '110,50' });
    fixture.componentInstance.form.get('transferredPrice')?.markAsTouched();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.form.get('transferredPrice')?.valid,
    ).toBeTrue();
  });
});
