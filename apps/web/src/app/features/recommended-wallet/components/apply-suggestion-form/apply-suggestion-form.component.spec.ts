import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Asset, Position } from 'dindin-models';
import {
  ApplySuggestionFormComponent,
  ApplySuggestionValue,
} from './apply-suggestion-form.component';

// ---------------------------------------------------------------------------
// Testes do formulário de aplicar a compra sugerida (issue #310)
//
// Saiu do recommended-wallet.component com a prévia de quantidade e preço
// médio (#276). Recebe as posições e o catálogo já carregados e emite o que
// aplicar; quem chama a API continua sendo o pai.
// ---------------------------------------------------------------------------

describe('ApplySuggestionFormComponent', () => {
  let fixture: ComponentFixture<ApplySuggestionFormComponent>;
  let component: ApplySuggestionFormComponent;
  let confirmados: ApplySuggestionValue[];
  let fechados: number;

  const hglg: Position = {
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

  const assets: Asset[] = [
    {
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      assetType: 'FII',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function setup(overrides: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(ApplySuggestionFormComponent);
    component = fixture.componentInstance;
    const inputs: Record<string, unknown> = {
      target: { ticker: 'HGLG11' },
      walletName: 'Carteira Principal',
      positions: [hglg],
      assets,
      quantity: '5',
      price: '110,00',
      error: null,
      saving: false,
      ...overrides,
    };
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    confirmados = [];
    fechados = 0;
    component.confirmed.subscribe((value) => confirmados.push(value));
    component.closed.subscribe(() => (fechados += 1));
    fixture.detectChanges();
  }

  function type(testId: string, value: string): void {
    const input = element(`[data-testid="${testId}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApplySuggestionFormComponent],
    }).compileComponents();
  });

  it('deve nomear o ativo e a carteira de destino', () => {
    setup();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain('HGLG11');
    expect(texto).toContain('Carteira Principal');
  });

  it('deve partir da quantidade e do preço sugeridos', () => {
    setup();

    expect(
      (element('[data-testid="apply-quantity"]') as HTMLInputElement).value,
    ).toBe('5');
    expect(
      (element('[data-testid="apply-price"]') as HTMLInputElement).value,
    ).toBe('110,00');
  });

  it('deve exibir a prévia de quantidade e preço médio', () => {
    setup();

    const preview = element('[data-testid="apply-preview"]')?.textContent ?? '';

    // 10 cotas a R$ 100 + 5 a R$ 110 → 15 cotas a R$ 103,33.
    expect(preview).toContain('10');
    expect(preview).toContain('15');
    expect(preview).toMatch(/R\$\s?103,33/);
  });

  it('deve tratar ativo novo como posição zerada', () => {
    setup({ target: { ticker: 'MXRF11' }, quantity: '3', price: '10,00' });

    const preview = element('[data-testid="apply-preview"]')?.textContent ?? '';

    expect(preview).toContain('0');
    expect(preview).toContain('3');
    expect(preview).toMatch(/R\$\s?10,00/);
  });

  it('não deve exibir prévia com quantidade ou preço inválidos', () => {
    setup();
    type('apply-quantity', '0');

    expect(element('[data-testid="apply-preview"]')).toBeNull();
  });

  it('deve avisar quando o ativo está fora do catálogo', () => {
    setup({ target: { ticker: 'XPLG11' } });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Ativo fora do catálogo',
    );
  });

  it('deve exibir o erro recebido do pai', () => {
    setup({ error: 'Não foi possível aplicar a compra.' });

    expect(element('[data-testid="apply-error"]')?.textContent).toContain(
      'Não foi possível aplicar a compra.',
    );
  });

  it('deve emitir a compra com o tipo do ativo resolvido', () => {
    setup();

    component.confirm();

    expect(confirmados).toEqual([
      { quantity: 5, price: 110, assetType: 'FII' },
    ]);
  });

  it('não deve emitir sem prévia válida', () => {
    setup();
    type('apply-price', 'abc');

    component.confirm();

    expect(confirmados).toEqual([]);
  });

  it('não deve emitir enquanto uma compra está sendo lançada', () => {
    setup({ saving: true });

    component.confirm();

    expect(confirmados).toEqual([]);
  });

  it('deve emitir closed ao cancelar', () => {
    setup();

    component.close();

    expect(fechados).toBe(1);
  });

  // Fechar durante o lançamento faria a resposta chegar no modal errado.
  it('não deve fechar enquanto a compra está sendo lançada', () => {
    setup({ saving: true });

    component.close();

    expect(fechados).toBe(0);
  });
});
