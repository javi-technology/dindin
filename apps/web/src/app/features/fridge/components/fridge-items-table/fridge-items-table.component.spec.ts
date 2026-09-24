import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FridgeItem } from 'dindin-models';
import { FridgeItemsTableComponent } from './fridge-items-table.component';

// ---------------------------------------------------------------------------
// Testes da tabela de itens da geladeira (issue #312)
//
// Saiu do fridge.component com o cálculo do potencial de ganho, que só existe
// por causa da coluna. Quem fala com a API continua sendo o pai.
// ---------------------------------------------------------------------------

describe('FridgeItemsTableComponent', () => {
  let fixture: ComponentFixture<FridgeItemsTableComponent>;
  let component: FridgeItemsTableComponent;

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
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function rows(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    );
  }

  function setup(list: FridgeItem[] = items): void {
    fixture = TestBed.createComponent(FridgeItemsTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', list);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FridgeItemsTableComponent],
    }).compileComponents();
  });

  it('deve renderizar uma linha por item', () => {
    setup();

    expect(rows().length).toBe(2);
  });

  it('deve exibir a cotação quando houver, e o preço de transferência quando não', () => {
    setup();

    expect(rows()[0].textContent).toMatch(/R\$\s?112,00/);
    expect(rows()[1].textContent).toMatch(/R\$\s?130,00/);
  });

  it('deve calcular o potencial sobre a cotação atual', () => {
    setup();

    // (120 - 112) / 112 = 7,14%
    expect(rows()[0].textContent).toMatch(/7,14\s?%/);
  });

  it('deve calcular o potencial sobre o preço de transferência sem cotação', () => {
    setup();

    // (145 - 130) / 130 = 11,54%
    expect(rows()[1].textContent).toMatch(/11,54\s?%/);
  });

  it('deve exibir traço sem base de cálculo', () => {
    setup([{ ...items[0], targetPrice: 0 }]);

    expect(rows()[0].textContent).toContain('—');
  });

  it('não deve renderizar a tabela sem itens', () => {
    setup([]);

    expect(element('table')).toBeNull();
  });

  it('deve emitir o item da linha em cada ação', () => {
    setup();
    const descongelados: FridgeItem[] = [];
    const editados: FridgeItem[] = [];
    const removidos: FridgeItem[] = [];
    component.unfreeze.subscribe((item) => descongelados.push(item));
    component.edit.subscribe((item) => editados.push(item));
    component.remove.subscribe((item) => removidos.push(item));

    element('[data-testid="btn-descongelar-item-0"]')?.click();
    element('[data-testid="btn-editar-item-0"]')?.click();
    element('[data-testid="btn-remover-item-0"]')?.click();

    expect(descongelados).toEqual([items[0]]);
    expect(editados).toEqual([items[0]]);
    expect(removidos).toEqual([items[0]]);
  });
  // Sem a data de apuração (issue #390), um fechamento do dia anterior parece
  // um preço errado.
  describe('data de apuração da cotação', () => {
    it('deve exibir a data de apuração junto do preço atual', () => {
      setup([
        {
          ...items[0],
          currentPrice: 112,
          currentPriceQuotedAt: '2026-09-23T21:31:00Z',
        },
      ]);

      expect(
        element('[data-testid="cotacao-apurada-0"]')?.textContent?.trim(),
      ).toBe('Fechamento de 23/09/2026');
    });

    it('não deve exibir indicação quando a cotação não tem data de apuração', () => {
      setup([{ ...items[0], currentPrice: 112 }]);

      expect(element('[data-testid="cotacao-apurada-0"]')).toBeNull();
      expect(rows().length).toBe(1);
    });
  });
});
