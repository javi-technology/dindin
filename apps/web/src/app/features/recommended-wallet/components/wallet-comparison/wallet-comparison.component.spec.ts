import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecommendedWalletComparison, Wallet } from 'dindin-models';
import { WalletComparisonComponent } from './wallet-comparison.component';

// ---------------------------------------------------------------------------
// Testes da comparação com a carteira do usuário (issue #310)
//
// Saiu do recommended-wallet.component com a escolha da carteira e a tabela
// de diferenças. A comparação chega pronta da API: o componente só a exibe e
// avisa quando o usuário troca de carteira.
// ---------------------------------------------------------------------------

describe('WalletComparisonComponent', () => {
  let fixture: ComponentFixture<WalletComparisonComponent>;
  let component: WalletComparisonComponent;
  let escolhidas: string[];

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

  const recommended: RecommendedWalletComparison['recommended'] = {
    id: 'recommended-1',
    provider: 'BB',
    month: '2026-09',
    revision: 1,
    status: 'confirmed',
    publishedAt: '2026-09-01',
    sourceFile: 'carteira-2026-09.pdf',
    parsedAt: '2026-09-01T00:00:00Z',
    renda: [],
    ganho: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const comparison: RecommendedWalletComparison = {
    recommended,
    items: [
      {
        ticker: 'HGLG11',
        status: 'match',
        // A API devolve peso em fração: 0.125 é 12,50%.
        recommendedWeight: 0.125,
        currentWeight: 0.1198,
        quantity: 10,
        currentValue: 1600,
      },
      {
        ticker: 'XPLG11',
        status: 'missing',
        recommendedWeight: 0.075,
        currentWeight: null,
        quantity: 0,
        currentValue: 0,
      },
    ],
    totalValue: 1600,
  };

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function rows(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    );
  }

  function setup(
    diff: RecommendedWalletComparison | null = comparison,
    selectedWalletId: string | null = 'wallet-1',
  ): void {
    fixture = TestBed.createComponent(WalletComparisonComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('wallets', wallets);
    fixture.componentRef.setInput('selectedWalletId', selectedWalletId);
    fixture.componentRef.setInput('comparison', diff);
    escolhidas = [];
    component.walletChange.subscribe((value) => escolhidas.push(value));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletComparisonComponent],
    }).compileComponents();
  });

  it('deve listar as carteiras do usuário', () => {
    setup();

    const options = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="wallet-select"] option',
    );

    expect(options.length).toBe(2);
    expect(options[0].textContent).toContain('Carteira Principal');
  });

  it('deve avisar a troca de carteira', () => {
    setup();

    const select = element(
      '[data-testid="wallet-select"]',
    ) as HTMLSelectElement;
    select.value = 'wallet-2';
    select.dispatchEvent(new Event('change'));

    expect(escolhidas).toEqual(['wallet-2']);
  });

  it('deve renderizar uma linha por item comparado', () => {
    setup();

    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain('HGLG11');
  });

  it('deve exibir os pesos em percentual', () => {
    setup();

    // A API devolve fração: 0.125 precisa aparecer como 12,50%, não 0,13%.
    const hglg = rows()[0].textContent ?? '';

    expect(hglg).toContain('12,50%');
    expect(hglg).toContain('11,98%');
  });

  it('deve exibir traço para o peso ausente', () => {
    setup();

    // XPLG11 não está na carteira do usuário: peso atual sem valor.
    expect(rows()[1].textContent).toContain('—');
  });

  it('deve exibir o valor total da carteira comparada', () => {
    setup();

    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(
      /R\$\s?1\.600,00/,
    );
  });

  it('deve avisar quando não há posições para comparar', () => {
    setup({ recommended, items: [], totalValue: 0 });

    expect(element('[data-testid="empty-comparison"]')).not.toBeNull();
  });

  it('não deve renderizar a tabela sem comparação carregada', () => {
    setup(null);

    expect(element('tbody')).toBeNull();
    expect(element('[data-testid="empty-comparison"]')).toBeNull();
  });
});
