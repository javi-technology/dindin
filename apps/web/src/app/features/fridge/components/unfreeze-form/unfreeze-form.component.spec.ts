import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FridgeItem, Wallet } from 'dindin-models';
import { UnfreezeFormComponent } from './unfreeze-form.component';

// ---------------------------------------------------------------------------
// Testes do formulário de descongelar (issue #312)
//
// Saiu do fridge.component. Escolhe a carteira de destino e emite o id; quem
// move o item é o pai.
// ---------------------------------------------------------------------------

describe('UnfreezeFormComponent', () => {
  let fixture: ComponentFixture<UnfreezeFormComponent>;
  let component: UnfreezeFormComponent;
  let confirmadas: string[];
  let fechados: number;

  const wallets: Wallet[] = [
    {
      id: 'wallet-1',
      ownerId: 'user-1',
      name: 'Carteira Principal',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'wallet-2',
      ownerId: 'user-1',
      name: 'Carteira Secundária',
      currency: 'BRL',
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

  function setup(available: Wallet[] = wallets): void {
    fixture = TestBed.createComponent(UnfreezeFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('wallets', available);
    confirmadas = [];
    fechados = 0;
    component.confirmed.subscribe((value) => confirmadas.push(value));
    component.closed.subscribe(() => (fechados += 1));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnfreezeFormComponent],
    }).compileComponents();
  });

  it('deve nomear o item que será movido', () => {
    setup();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'HGLG11',
    );
  });

  it('deve listar as carteiras e pré-selecionar a primeira', () => {
    setup();

    const options = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'select option',
    );

    expect(options.length).toBe(2);
    expect(component.form.value.walletId).toBe('wallet-1');
  });

  it('deve emitir a carteira escolhida', () => {
    setup();
    component.form.patchValue({ walletId: 'wallet-2' });

    component.submit();

    expect(confirmadas).toEqual(['wallet-2']);
  });

  it('deve avisar quando não há carteira disponível', () => {
    setup([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma carteira disponível.',
    );
    expect(
      (element('button[type="submit"]') as HTMLButtonElement).disabled,
    ).toBeTrue();
  });

  it('não deve emitir sem carteira escolhida', () => {
    setup([]);

    component.submit();

    expect(confirmadas).toEqual([]);
  });

  it('deve exibir o erro recebido do pai', () => {
    setup();
    fixture.componentRef.setInput('error', 'Erro ao descongelar item.');
    fixture.detectChanges();

    expect(element('[data-testid="unfreeze-error"]')?.textContent).toContain(
      'Erro ao descongelar item.',
    );
  });

  it('deve emitir closed ao cancelar', () => {
    setup();

    element('[data-testid="btn-cancelar-descongelar"]')?.click();

    expect(fechados).toBe(1);
  });
});
