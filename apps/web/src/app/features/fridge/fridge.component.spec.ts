import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { FridgeComponent } from './fridge.component';
import { FridgeService } from '../../core/services/fridge.service';
import { Fridge, FridgeItem } from 'dindin-models';

describe('FridgeComponent', () => {
  let fixture: ComponentFixture<FridgeComponent>;
  let fridgeServiceMock: jasmine.SpyObj<FridgeService>;

  const fridge: Fridge = {
    id: 'fridge-1',
    ownerId: 'user-123',
    name: 'Geladeira Principal',
    description: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const items: FridgeItem[] = [
    {
      id: 'item-1',
      fridgeId: 'fridge-1',
      ticker: 'HGLG11',
      quantity: 10,
      transferredPrice: 100,
      targetPrice: 90,
      currentPrice: 95,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'item-2',
      fridgeId: 'fridge-1',
      ticker: 'KNRI11',
      quantity: 5,
      transferredPrice: 130,
      targetPrice: 120,
      currentPrice: 125,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    fridgeServiceMock = jasmine.createSpyObj('FridgeService', [
      'listFridges',
      'listItems',
      'updateItem',
      'deleteItem',
    ]);

    fridgeServiceMock.listFridges.and.returnValue(of([fridge]));
    fridgeServiceMock.listItems.and.returnValue(of(items));

    await TestBed.configureTestingModule({
      imports: [FridgeComponent],
      providers: [{ provide: FridgeService, useValue: fridgeServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('deve listar geladeiras e selecionar a primeira', () => {
    expect(fridgeServiceMock.listFridges).toHaveBeenCalled();
    expect(fridgeServiceMock.listItems).toHaveBeenCalledWith('fridge-1');
  });

  it('deve renderizar tabela com ticker, quantidade, preço atual, preço-alvo e potencial', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent;
    expect(firstRow).toContain('HGLG11');
    expect(firstRow).toContain('10');
    expect(firstRow).toMatch(/R\$\s?95,00/);
    expect(firstRow).toMatch(/R\$\s?90,00/);
  });

  it('deve calcular e exibir o potencial de ganho', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    // potencial = (90 - 95) / 95 * 100 = -5,26%
    expect(rows[0].textContent).toMatch(/-5,26\s?%/);
    // potencial = (120 - 125) / 125 * 100 = -4,00%
    expect(rows[1].textContent).toMatch(/-4,00\s?%/);
  });

  it('deve usar transferredPrice como fallback quando currentPrice ausente', () => {
    const itemSemCurrent: FridgeItem = {
      ...items[0],
      id: 'item-3',
      ticker: 'MXRF11',
      currentPrice: undefined,
      transferredPrice: 100,
      targetPrice: 90,
    };
    fridgeServiceMock.listItems.and.returnValue(of([itemSemCurrent]));
    fixture.componentInstance.loadItems('fridge-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    // potencial = (90 - 100) / 100 * 100 = -10,00%
    expect(row?.textContent).toMatch(/-10,00\s?%/);
  });

  it('deve exibir "—" quando currentPrice e transferredPrice ausentes', () => {
    const itemSemPrecos: FridgeItem = {
      ...items[0],
      id: 'item-4',
      ticker: 'VISC11',
      currentPrice: undefined,
      transferredPrice: 0,
      targetPrice: 90,
    };
    fridgeServiceMock.listItems.and.returnValue(of([itemSemPrecos]));
    fixture.componentInstance.loadItems('fridge-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = compiled.querySelector('tbody tr');
    expect(row?.textContent).toContain('—');
  });

  it('deve abrir formulário ao clicar em editar preço-alvo', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const editButton = compiled.querySelector(
      '[data-testid="btn-editar-0"]',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();

    const form = compiled.querySelector('[data-testid="target-form"]');
    expect(form).toBeTruthy();
  });

  it('deve abrir formulário preenchido com preço-alvo atual', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const editButton = compiled.querySelector(
      '[data-testid="btn-editar-0"]',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();

    const targetInput = compiled.querySelector(
      'input#targetPrice',
    ) as HTMLInputElement;
    expect(targetInput.value).toBe('90');
  });

  it('deve chamar updateItem ao salvar novo preço-alvo', fakeAsync(() => {
    fridgeServiceMock.updateItem.and.returnValue(of(items[0]));
    fridgeServiceMock.listItems.and.returnValue(of(items));

    const compiled = fixture.nativeElement as HTMLElement;
    const editButton = compiled.querySelector(
      '[data-testid="btn-editar-0"]',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({ targetPrice: '85,00' });
    fixture.componentInstance.saveTarget();
    tick();
    fixture.detectChanges();

    expect(fridgeServiceMock.updateItem).toHaveBeenCalledWith(
      'fridge-1',
      'item-1',
      { targetPrice: 85 },
    );
  }));

  it('deve fazer parse de preço-alvo com vírgula decimal', fakeAsync(() => {
    fridgeServiceMock.updateItem.and.returnValue(of(items[0]));

    fixture.componentInstance.openForm(items[0]);
    fixture.componentInstance.form.patchValue({ targetPrice: '92,50' });
    fixture.componentInstance.saveTarget();
    tick();

    expect(fridgeServiceMock.updateItem).toHaveBeenCalledWith(
      'fridge-1',
      'item-1',
      { targetPrice: 92.5 },
    );
  }));

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

  it('deve chamar deleteItem ao confirmar remoção', fakeAsync(() => {
    fridgeServiceMock.deleteItem.and.returnValue(of(undefined));
    fridgeServiceMock.listItems.and.returnValue(of(items.slice(1)));

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

    expect(fridgeServiceMock.deleteItem).toHaveBeenCalledWith(
      'fridge-1',
      'item-1',
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

  it('deve exibir erro no formulário quando falha ao atualizar preço-alvo', fakeAsync(() => {
    fridgeServiceMock.updateItem.and.returnValue(
      throwError(() => new Error('Server error')),
    );

    fixture.componentInstance.openForm(items[0]);
    fixture.componentInstance.form.patchValue({ targetPrice: '85,00' });
    fixture.componentInstance.saveTarget();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const formError = compiled.querySelector('[data-testid="form-error"]');
    expect(formError?.textContent).toContain('Erro ao atualizar preço-alvo');
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
    fixture.componentInstance.openForm(items[0]);
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

  it('deve rejeitar preço-alvo com formato inválido', () => {
    fixture.componentInstance.openForm(items[0]);
    fixture.componentInstance.form.patchValue({ targetPrice: 'abc' });
    fixture.componentInstance.form.get('targetPrice')?.markAsTouched();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.form
        .get('targetPrice')
        ?.hasError('invalidDecimal'),
    ).toBeTrue();
  });

  it('deve aceitar preço-alvo com vírgula como separador decimal', () => {
    fixture.componentInstance.openForm(items[0]);
    fixture.componentInstance.form.patchValue({ targetPrice: '90,50' });
    fixture.componentInstance.form.get('targetPrice')?.markAsTouched();
    fixture.detectChanges();

    expect(fixture.componentInstance.form.get('targetPrice')?.valid).toBeTrue();
  });

  it('deve exibir mensagem quando não houver geladeiras', async () => {
    fridgeServiceMock.listFridges.and.returnValue(of([]));
    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Nenhuma geladeira encontrada');
  });

  it('deve exibir mensagem quando não houver itens', async () => {
    fridgeServiceMock.listItems.and.returnValue(of([]));
    fixture = TestBed.createComponent(FridgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Nenhum item encontrado');
  });
});
