import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Fridge, Position } from 'dindin-models';
import {
  MoveToFridgeFormComponent,
  MoveToFridgeValue,
} from './move-to-fridge-form.component';

// ---------------------------------------------------------------------------
// Testes do formulário de mover para a geladeira (issue #309)
//
// Saiu do wallet.component junto com a escolha da geladeira de destino e o
// preço-alvo. Como o formulário de posição, não fala com a API: emite o
// payload e o pai move.
// ---------------------------------------------------------------------------

describe('MoveToFridgeFormComponent', () => {
  let fixture: ComponentFixture<MoveToFridgeFormComponent>;
  let component: MoveToFridgeFormComponent;
  let confirmados: MoveToFridgeValue[];
  let fechados: number;

  const fridges: Fridge[] = [
    {
      id: 'fridge-1',
      ownerId: 'user-1',
      name: 'Geladeira Principal',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'fridge-2',
      ownerId: 'user-1',
      name: 'Geladeira Secundária',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const position: Position = {
    id: 'position-1',
    walletId: 'wallet-1',
    ticker: 'HGLG11',
    assetType: 'FII',
    quantity: 10,
    averagePrice: 100,
    inFridge: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function setup(available: Fridge[] = fridges): void {
    fixture = TestBed.createComponent(MoveToFridgeFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('position', position);
    fixture.componentRef.setInput('fridges', available);
    confirmados = [];
    fechados = 0;
    component.confirmed.subscribe((value) => confirmados.push(value));
    component.closed.subscribe(() => (fechados += 1));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoveToFridgeFormComponent],
    }).compileComponents();
  });

  it('deve nomear a posição que será movida', () => {
    setup();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'HGLG11',
    );
  });

  it('deve listar as geladeiras e pré-selecionar a primeira', () => {
    setup();

    const options = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="mover-fridge-select"] option',
    );

    expect(options.length).toBe(2);
    expect(component.form.value.fridgeId).toBe('fridge-1');
  });

  it('deve emitir a geladeira e o preço-alvo escolhidos', () => {
    setup();
    component.form.patchValue({ fridgeId: 'fridge-2', targetPrice: '120,50' });

    component.submit();

    expect(confirmados).toEqual([{ fridgeId: 'fridge-2', targetPrice: 120.5 }]);
  });

  it('não deve emitir com o formulário inválido', () => {
    setup();
    component.form.patchValue({ targetPrice: 'abc' });

    component.submit();

    expect(confirmados).toEqual([]);
    expect(component.form.get('targetPrice')?.touched).toBe(true);
  });

  it('deve exibir o erro recebido do pai', () => {
    setup();
    fixture.componentRef.setInput('error', 'Erro ao mover posição.');
    fixture.detectChanges();

    expect(element('[data-testid="mover-error"]')?.textContent).toContain(
      'Erro ao mover posição.',
    );
  });

  it('deve emitir closed no botão de cancelar', () => {
    setup();

    element('[data-testid="btn-cancelar-mover"]')?.click();

    expect(fechados).toBe(1);
  });
});
