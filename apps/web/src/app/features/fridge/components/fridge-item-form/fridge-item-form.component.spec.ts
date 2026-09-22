import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Asset, FridgeItem } from 'dindin-models';
import {
  FridgeItemFormComponent,
  FridgeItemFormValue,
} from './fridge-item-form.component';

// ---------------------------------------------------------------------------
// Testes do formulário de item da geladeira (issue #312)
//
// Saiu do fridge.component. Monta o payload uma única vez — antes o `save()`
// do pai repetia o mesmo objeto nos ramos de criação e edição — e o emite;
// quem chama a API é o pai.
// ---------------------------------------------------------------------------

describe('FridgeItemFormComponent', () => {
  let fixture: ComponentFixture<FridgeItemFormComponent>;
  let component: FridgeItemFormComponent;
  let salvos: FridgeItemFormValue[];
  let fechados: number;

  const assets: Asset[] = [
    {
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      assetType: 'FII',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const item: FridgeItem = {
    id: 'item-1',
    fridgeId: 'fridge-1',
    ticker: 'HGLG11',
    quantity: 10,
    transferredPrice: 110.5,
    targetPrice: 120,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function setup(editing: FridgeItem | null = null): void {
    fixture = TestBed.createComponent(FridgeItemFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('item', editing);
    fixture.componentRef.setInput('assets', assets);
    salvos = [];
    fechados = 0;
    component.save.subscribe((value) => salvos.push(value));
    component.closed.subscribe(() => (fechados += 1));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FridgeItemFormComponent],
    }).compileComponents();
  });

  it('deve começar vazio ao adicionar', () => {
    setup();

    expect(component.form.value).toEqual(
      expect.objectContaining({
        ticker: '',
        quantity: 0,
        transferredPrice: '0',
        targetPrice: '0',
      }),
    );
  });

  it('deve preencher com o item ao editar', () => {
    setup(item);

    expect(component.form.value).toEqual(
      expect.objectContaining({
        ticker: 'HGLG11',
        quantity: 10,
        transferredPrice: '110.5',
        targetPrice: '120',
      }),
    );
  });

  it('deve listar os ativos recebidos', () => {
    setup();

    const options = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'select#item-ticker option',
    );

    // A primeira opção é o placeholder.
    expect(options.length).toBe(2);
    expect(options[1].textContent).toContain('HGLG11');
  });

  it('deve exibir o erro do catálogo de ativos', () => {
    setup();
    fixture.componentRef.setInput('assetsError', 'Erro ao carregar ativos.');
    fixture.detectChanges();

    expect(element('[data-testid="assets-error"]')?.textContent).toContain(
      'Erro ao carregar ativos.',
    );
  });

  it('deve exibir o erro recebido do pai', () => {
    setup();
    fixture.componentRef.setInput('error', 'Erro ao criar item.');
    fixture.detectChanges();

    expect(element('[data-testid="form-error"]')?.textContent).toContain(
      'Erro ao criar item.',
    );
  });

  it('deve emitir o payload com o ticker normalizado', () => {
    setup();
    component.form.patchValue({
      ticker: 'hglg11',
      quantity: 15,
      transferredPrice: '110,50',
      targetPrice: '120',
    });

    component.submit();

    expect(salvos).toEqual([
      {
        ticker: 'HGLG11',
        quantity: 15,
        transferredPrice: 110.5,
        targetPrice: 120,
      },
    ]);
  });

  it('não deve emitir com o formulário inválido', () => {
    setup();
    component.form.patchValue({ ticker: '', quantity: 0 });

    component.submit();

    expect(salvos).toEqual([]);
    expect(component.form.get('ticker')?.touched).toBe(true);
  });

  it('deve acusar preço com formato inválido', () => {
    setup();
    component.form.patchValue({ transferredPrice: 'abc' });
    component.form.get('transferredPrice')?.markAsTouched();
    fixture.detectChanges();

    expect(
      component.form.get('transferredPrice')?.hasError('invalidDecimal'),
    ).toBe(true);
  });

  it('deve aceitar preço com vírgula como separador decimal', () => {
    setup();
    component.form.patchValue({ transferredPrice: '110,50' });
    component.form.get('transferredPrice')?.markAsTouched();
    fixture.detectChanges();

    expect(component.form.get('transferredPrice')?.valid).toBe(true);
  });

  it('deve emitir closed no botão de cancelar', () => {
    setup();

    element('[data-testid="btn-cancelar-item"]')?.click();

    expect(fechados).toBe(1);
  });
});
