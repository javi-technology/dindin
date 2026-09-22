import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { MeResponse } from 'dindin-shared-types';
import {
  AiSuggestion,
  Asset,
  Position,
  RecommendedWallet,
  RecommendedWalletComparison,
  Wallet,
} from 'dindin-models';
import { RecommendedWalletComponent } from './recommended-wallet.component';
import { RecommendedWalletService } from '../../core/services/recommended-wallet.service';
import { WalletService } from '../../core/services/wallet.service';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { PositionService } from '../../core/services/position.service';
import { AssetService } from '../../core/services/asset.service';

describe('RecommendedWalletComponent', () => {
  /**
   * O painel de sugestão virou subcomponente (#310): a geração passa a ser
   * pedida pelo botão, como o usuário faz.
   */
  function clickGenerate(): void {
    (
      fixture.nativeElement.querySelector(
        '[data-testid="generate-suggestion-button"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
  }

  let fixture: ComponentFixture<RecommendedWalletComponent>;
  let serviceMock: jasmine.SpyObj<RecommendedWalletService>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;
  let positionServiceMock: jasmine.SpyObj<PositionService>;
  let assetServiceMock: jasmine.SpyObj<AssetService>;
  let authServiceMock: { isAdmin: any };
  let billingServiceMock: {
    hasAi: ReturnType<typeof signal<boolean>>;
    loaded: ReturnType<typeof signal<boolean>>;
    subscriptionRequired: ReturnType<typeof signal<boolean>>;
    loadMe: any;
  };

  const me: MeResponse = {
    uid: 'user-1',
    admin: false,
    subscription: {
      status: 'active',
      plan: 'basic',
      interval: 'month',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    entitlements: ['ai'],
  };

  const wallet: RecommendedWallet = {
    id: 'bb-fii_2026-09',
    provider: 'BB',
    month: '2026-09',
    revision: 2,
    publishedAt: '2026-09-02',
    sourceFile: 'wallets/fii-bb/CartFII_Set26_2.pdf',
    status: 'pending_review',
    renda: [
      {
        ticker: 'HGLG11',
        segment: 'Logísticos',
        weight: 0.125,
        closePrice: 100,
        ifixWeight: 0.04,
        inCatalog: true,
      },
    ],
    ganho: [],
    parsedAt: '2026-09-04T00:00:00Z',
    createdAt: '2026-09-04T00:00:00Z',
    updatedAt: '2026-09-04T00:00:00Z',
  };
  const userWallet: Wallet = {
    id: 'wallet-1',
    ownerId: 'user-1',
    name: 'Principal',
    currency: 'BRL',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const comparison: RecommendedWalletComparison = {
    recommended: wallet,
    items: [
      {
        ticker: 'HGLG11',
        recommendedWeight: 0.125,
        currentWeight: 0.1,
        quantity: 2,
        currentValue: 200,
        status: 'match',
      },
    ],
    totalValue: 200,
  };

  beforeEach(async () => {
    serviceMock = jasmine.createSpyObj('RecommendedWalletService', [
      'list',
      'compare',
      'confirm',
      'import',
      'getSuggestion',
      'generateSuggestion',
      'applySuggestionItem',
    ]);
    positionServiceMock = jasmine.createSpyObj('PositionService', [
      'list',
      'create',
      'update',
    ]);
    assetServiceMock = jasmine.createSpyObj('AssetService', ['list']);
    walletServiceMock = jasmine.createSpyObj('WalletService', ['list']);
    authServiceMock = { isAdmin: jasmine.createSpy('isAdmin') };
    billingServiceMock = {
      hasAi: signal(true),
      loaded: signal(true),
      subscriptionRequired: signal(false),
      loadMe: jasmine.createSpy('loadMe').and.returnValue(of(me)),
    };

    serviceMock.list.and.returnValue(of([wallet]));
    serviceMock.compare.and.returnValue(of(comparison));
    serviceMock.confirm.and.returnValue(of({ ...wallet, status: 'confirmed' }));
    serviceMock.import.and.returnValue(of(wallet));
    serviceMock.getSuggestion.and.returnValue(
      throwError(() => ({ status: 404 })),
    );
    serviceMock.generateSuggestion.and.returnValue(
      of({
        id: 'wallet-1_2026-09_renda',
        walletId: 'wallet-1',
        month: '2026-09',
        tab: 'renda',
        model: 'modelo',
        summary: 'Resumo',
        items: [
          {
            ticker: 'HGLG11',
            action: 'buy',
            priority: 1,
            rationale: 'Aumente a posição.',
            suggestedAmount: 100,
            suggestedQuantity: 1,
            referencePrice: 95,
            fallbackAllocations: [
              {
                ticker: 'HGCR11',
                amount: 100,
                suggestedQuantity: 1,
                referencePrice: 96.44,
              },
            ],
          },
          {
            ticker: 'MXRF11',
            action: 'buy',
            priority: 2,
            rationale: 'Aguarde acumular.',
            suggestedAmount: 94.3,
            suggestedQuantity: 0,
            referencePrice: 96.44,
          },
          {
            ticker: 'VISC11',
            action: 'hold',
            priority: 3,
            rationale: 'Mantenha se disponível.',
            qualifiedInvestor: true,
          },
        ],
        disclaimer: 'Aviso',
        createdAt: '2026-09-04T12:00:00Z',
        contribution: 500,
        projectedDividends: 25,
      } satisfies AiSuggestion),
    );
    walletServiceMock.list.and.returnValue(of([userWallet]));
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [RecommendedWalletComponent],
      providers: [
        provideRouter([]),
        { provide: RecommendedWalletService, useValue: serviceMock },
        { provide: WalletService, useValue: walletServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: BillingService, useValue: billingServiceMock },
        { provide: PositionService, useValue: positionServiceMock },
        { provide: AssetService, useValue: assetServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecommendedWalletComponent);
  });

  it('deve carregar a carteira mais recente e selecionar a primeira carteira do usuário', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedMonth()).toBe('2026-09');
    expect(fixture.componentInstance.selectedWalletId()).toBe('wallet-1');
    expect(serviceMock.compare).toHaveBeenCalledWith(
      'wallet-1',
      '2026-09',
      'renda',
    );
  });

  it('deve comparar novamente ao trocar para ganho de capital', () => {
    fixture.detectChanges();

    fixture.componentInstance.selectTab('ganho');

    expect(serviceMock.compare).toHaveBeenCalledWith(
      'wallet-1',
      '2026-09',
      'ganho',
    );
  });

  it('deve confirmar usando o modal customizado', () => {
    fixture.detectChanges();

    fixture.componentInstance.openConfirmModal();
    expect(fixture.componentInstance.confirmModalOpen()).toBe(true);
    fixture.componentInstance.confirmWallet();

    expect(serviceMock.confirm).toHaveBeenCalledWith(wallet.id);
    expect(fixture.componentInstance.confirmModalOpen()).toBe(false);
    expect(fixture.componentInstance.recommendedWallet()?.status).toBe(
      'confirmed',
    );
  });

  it('deve rejeitar arquivo que não tenha nome de carteira BB', () => {
    fixture.detectChanges();
    const file = new File(['pdf'], 'outro.pdf', { type: 'application/pdf' });

    fixture.componentInstance.onFileSelected({
      target: { files: [file] },
    } as unknown as Event);

    expect(serviceMock.import).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBe(
      'O nome do arquivo deve começar com CartFII_.',
    );
  });

  it('deve exibir erro quando falhar ao carregar carteiras recomendadas', () => {
    serviceMock.list.and.returnValue(
      throwError(() => new Error('falha de rede')),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(
      'Erro ao carregar carteiras recomendadas.',
    );
  });

  it('deve ignorar resposta atrasada de uma comparação anterior', () => {
    const firstResponse = new Subject<RecommendedWalletComparison>();
    const secondResponse = new Subject<RecommendedWalletComparison>();
    serviceMock.compare.and.callFake((walletId: string) =>
      walletId === 'wallet-1'
        ? firstResponse.asObservable()
        : secondResponse.asObservable(),
    );

    fixture.detectChanges();
    fixture.componentInstance.selectWallet('wallet-2');

    const secondComparison = {
      ...comparison,
      recommended: { ...wallet, id: 'bb-fii_2026-08', month: '2026-08' },
    };
    secondResponse.next(secondComparison);
    firstResponse.next(comparison);

    expect(fixture.componentInstance.comparison()).toEqual(secondComparison);
  });

  it('deve carregar sugestão salva ao iniciar', () => {
    fixture.detectChanges();

    expect(serviceMock.getSuggestion).toHaveBeenCalledWith(
      'wallet-1',
      '2026-09',
      'renda',
    );
  });

  it('deve desabilitar geração sem carteira ou mês selecionados', () => {
    fixture.detectChanges();

    fixture.componentInstance.selectedWalletId.set(null);
    expect(fixture.componentInstance.canGenerateSuggestion()).toBe(false);
  });

  it('deve mostrar loading enquanto gera sugestão', () => {
    const pending = new Subject<AiSuggestion>();
    serviceMock.generateSuggestion.and.returnValue(pending);
    fixture.detectChanges();

    clickGenerate();

    expect(fixture.componentInstance.suggestionLoading()).toBe(true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="generate-suggestion-button"]',
      ).textContent,
    ).toContain('Gerando');

    pending.next({} as AiSuggestion);
    pending.complete();
  });

  it('deve ignorar resposta atrasada após trocar a seleção', () => {
    const pending = new Subject<AiSuggestion>();
    serviceMock.generateSuggestion.and.returnValue(pending);
    fixture.detectChanges();

    clickGenerate();
    fixture.componentInstance.selectTab('ganho');

    pending.next({} as AiSuggestion);

    expect(fixture.componentInstance.suggestion()).toBeNull();
    expect(fixture.componentInstance.suggestionLoading()).toBe(false);
  });

  it('deve renderizar itens da sugestão com seus badges', () => {
    fixture.detectChanges();

    clickGenerate();
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '[data-testid="suggestion-card"]',
    );
    expect(card.textContent).toContain('Resumo');
    expect(card.textContent).toContain('Comprar');
    expect(card.textContent).toContain('Aumente a posição.');
    expect(card.textContent).toContain('Aporte:');
    expect(card.textContent).toContain('Proventos projetados:');
    expect(card.textContent).toContain('≈ 1 cota a R$\u00a095,00');
    expect(card.textContent).toContain('Comprar');
    expect(card.textContent).toContain('Investidor qualificado');
    expect(card.textContent).toContain(
      'FII exclusivo para investidor qualificado (opcional) — pode não estar disponível para compra na sua corretora.',
    );
    expect(
      card.querySelector('[data-testid="fallback-allocations"]')?.textContent,
    ).toContain('HGCR11');
    expect(
      card.querySelector('[data-testid="fallback-allocations"]')?.textContent,
    ).toContain('redistribua');
    const regularItem = Array.from(
      card.querySelectorAll('li') as NodeListOf<HTMLElement>,
    ).find((item) => item.textContent?.includes('HGLG11'));
    expect(regularItem?.textContent).not.toContain('Investidor qualificado');
  });

  it('deve sinalizar quando o valor não alcança uma cota', () => {
    fixture.detectChanges();

    clickGenerate();
    fixture.detectChanges();

    const item = Array.from(
      fixture.nativeElement.querySelectorAll('li') as NodeListOf<HTMLElement>,
    ).find((element) => element.textContent?.includes('MXRF11'));
    const badge = item?.querySelector('span');

    expect(item!.textContent).toContain('Aguardar');
    expect(badge?.classList.contains('bg-green-100')).toBe(false);
    expect(item!.textContent).toContain(
      'Valor insuficiente para 1 cota (R$\u00a096,44); aguarde acumular ou redistribua.',
    );
    expect(
      fixture.nativeElement.querySelector('[data-testid="suggestion-card"]')
        .textContent,
    ).toContain('Comprar');
  });

  it('deve enviar aporte parseado no formato pt-BR', () => {
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="contribution-input"]',
    ) as HTMLInputElement;
    input.value = '1.500,50';
    input.dispatchEvent(new Event('input'));

    clickGenerate();

    expect(serviceMock.generateSuggestion).toHaveBeenCalledWith(
      'wallet-1',
      '2026-09',
      'renda',
      false,
      1500.5,
    );
  });

  it('deve rejeitar aporte inválido sem chamar o serviço', () => {
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="contribution-input"]',
    ) as HTMLInputElement;
    input.value = '-1';
    input.dispatchEvent(new Event('input'));

    clickGenerate();

    expect(
      fixture.nativeElement.querySelector('[data-testid="suggestion-error"]')
        .textContent,
    ).toContain('Informe um valor de aporte válido.');
    expect(serviceMock.generateSuggestion).not.toHaveBeenCalled();
  });

  it('deve mostrar mensagem amigável quando a geração falhar', () => {
    serviceMock.generateSuggestion.and.returnValue(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();

    clickGenerate();

    expect(fixture.componentInstance.suggestionError()).toBe(
      'Não foi possível gerar a sugestão. Tente novamente.',
    );
  });

  it('deve exibir o paywall e não buscar sugestão quando não há acesso à IA', () => {
    billingServiceMock.hasAi.set(false);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="ai-paywall"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="generate-suggestion-button"]',
      ),
    ).toBeNull();
    expect(serviceMock.getSuggestion).not.toHaveBeenCalled();
  });

  it('deve exibir os controles e não o paywall quando há acesso à IA', () => {
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="ai-paywall"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="generate-suggestion-button"]',
      ),
    ).not.toBeNull();
  });

  it('deve exibir o paywall quando a API exige assinatura', () => {
    fixture.detectChanges();

    billingServiceMock.subscriptionRequired.set(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="ai-paywall"]'),
    ).not.toBeNull();
  });

  it('não deve oferecer a geração quando não há acesso à IA', () => {
    billingServiceMock.hasAi.set(false);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="generate-suggestion-button"]',
      ),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="ai-paywall"]'),
    ).not.toBeNull();
    expect(serviceMock.generateSuggestion).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Aplicar itens da Sugestão do mês na carteira (issue #276)
  // -------------------------------------------------------------------------
  describe('aplicar na carteira', () => {
    const suggestion: AiSuggestion = {
      id: 'wallet-1_2026-09_renda',
      walletId: 'wallet-1',
      month: '2026-09',
      tab: 'renda',
      model: 'modelo',
      summary: 'Resumo',
      items: [
        {
          ticker: 'HGLG11',
          action: 'buy',
          priority: 1,
          rationale: 'Aumente a posição.',
          suggestedAmount: 100,
          suggestedQuantity: 1,
          referencePrice: 95,
          fallbackAllocations: [
            {
              ticker: 'HGCR11',
              amount: 100,
              suggestedQuantity: 1,
              referencePrice: 96.44,
            },
          ],
        },
        {
          ticker: 'MXRF11',
          action: 'buy',
          priority: 2,
          rationale: 'Aguarde acumular.',
          suggestedAmount: 9,
          suggestedQuantity: 0,
          referencePrice: 10,
        },
        {
          ticker: 'VISC11',
          action: 'hold',
          priority: 3,
          rationale: 'Mantenha.',
        },
        {
          ticker: 'XPML11',
          action: 'reduce',
          priority: 4,
          rationale: 'Reduza.',
        },
      ],
      disclaimer: 'Aviso',
      createdAt: '2026-09-04T12:00:00Z',
    };
    const positions: Position[] = [
      {
        id: 'pos-1',
        walletId: 'wallet-1',
        ticker: 'HGLG11',
        assetType: 'FII',
        quantity: 2,
        averagePrice: 100,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const assets: Asset[] = [
      {
        ticker: 'HGCR11',
        name: 'CSHG Recebíveis',
        assetType: 'FII',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const button = (testId: string): HTMLButtonElement | null =>
      el().querySelector(`[data-testid="${testId}"]`);
    const modal = (): HTMLElement | null =>
      el().querySelector('[data-testid="apply-modal"]');
    const input = (testId: string): HTMLInputElement =>
      modal()!.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
    const type = (testId: string, value: string): void => {
      const field = input(testId);
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const confirmButton = (): HTMLButtonElement =>
      modal()!.querySelector(
        '[data-testid="confirm-dialog-confirm"]',
      ) as HTMLButtonElement;
    const open = (testId: string): void => {
      button(testId)!.click();
      fixture.detectChanges();
    };

    beforeEach(() => {
      serviceMock.getSuggestion.and.returnValue(of(suggestion));
      positionServiceMock.list.and.returnValue(of(positions));
      assetServiceMock.list.and.returnValue(of(assets));
      positionServiceMock.update.and.returnValue(of(positions[0]));
      positionServiceMock.create.and.returnValue(of(positions[0]));
      serviceMock.applySuggestionItem.and.callFake((_id: any, body: any) =>
        of({
          ...suggestion,
          appliedItems: [{ ...body, appliedAt: '2026-09-18T00:00:00Z' }],
        }),
      );
      fixture.detectChanges();
    });

    it('deve exibir o botão só nas compras e nas alternativas', () => {
      expect(button('apply-item-HGLG11')).not.toBeNull();
      expect(button('apply-fallback-HGLG11-HGCR11')).not.toBeNull();
      // Aguardar, Manter e Reduzir não ganham botão.
      expect(button('apply-item-MXRF11')).toBeNull();
      expect(button('apply-item-VISC11')).toBeNull();
      expect(button('apply-item-XPML11')).toBeNull();
    });

    it('deve abrir o modal pré-preenchido com a carteira comparada', () => {
      open('apply-item-HGLG11');

      expect(modal()).not.toBeNull();
      expect(modal()!.textContent).toContain('Principal');
      expect(input('apply-quantity').value).toBe('1');
      expect(input('apply-price').value).toBe('95');
      expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-1');
    });

    it('deve mostrar a prévia da quantidade e do preço médio', () => {
      open('apply-item-HGLG11');

      const preview = modal()!.querySelector(
        '[data-testid="apply-preview"]',
      )!.textContent!;
      // 2 cotas a R$ 100 + 1 a R$ 95 → 3 cotas a R$ 98,33.
      expect(preview).toContain('2 → 3');
      expect(preview).toMatch(/R\$\s?100,00 → R\$\s?98,33/);
    });

    it('deve aplicar a compra com o preço pago em vírgula numa única chamada', () => {
      open('apply-item-HGLG11');
      type('apply-quantity', '2');
      type('apply-price', '89,20');

      confirmButton().click();
      fixture.detectChanges();

      // A API lança a posição e marca o item na mesma transação.
      expect(positionServiceMock.update).not.toHaveBeenCalled();
      expect(positionServiceMock.create).not.toHaveBeenCalled();
      expect(serviceMock.applySuggestionItem).toHaveBeenCalledTimes(1);
      expect(serviceMock.applySuggestionItem).toHaveBeenCalledWith(
        'wallet-1_2026-09_renda',
        { ticker: 'HGLG11', quantity: 2, price: 89.2 },
      );
      expect(modal()).toBeNull();
    });

    it('deve aplicar a alternativa com o FII de origem', () => {
      open('apply-fallback-HGLG11-HGCR11');
      expect(input('apply-price').value).toBe('96,44');

      confirmButton().click();
      fixture.detectChanges();

      expect(positionServiceMock.create).not.toHaveBeenCalled();
      expect(serviceMock.applySuggestionItem).toHaveBeenCalledWith(
        'wallet-1_2026-09_renda',
        { ticker: 'HGCR11', fallbackFor: 'HGLG11', quantity: 1, price: 96.44 },
      );
    });

    it('deve recarregar a comparação depois de aplicar', () => {
      const calls = serviceMock.compare.calls.count();
      open('apply-item-HGLG11');

      confirmButton().click();
      fixture.detectChanges();

      expect(serviceMock.compare.calls.count()).toBe(calls + 1);
    });

    it('deve bloquear a confirmação com quantidade ou preço inválidos', () => {
      open('apply-item-HGLG11');

      type('apply-quantity', '0');
      expect(confirmButton().disabled).toBe(true);

      type('apply-quantity', '1');
      type('apply-price', '-1');
      expect(confirmButton().disabled).toBe(true);

      type('apply-price', 'abc');
      expect(confirmButton().disabled).toBe(true);

      type('apply-price', '95');
      expect(confirmButton().disabled).toBe(false);
    });

    it('deve marcar como aplicado e impedir nova aplicação', () => {
      fixture.componentInstance.suggestion.set({
        ...suggestion,
        appliedItems: [
          {
            ticker: 'HGLG11',
            quantity: 3,
            price: 94.5,
            appliedAt: '2026-09-18T00:00:00Z',
          },
        ],
      });
      fixture.detectChanges();

      const applied = button('apply-item-HGLG11')!;
      expect(applied.disabled).toBe(true);
      expect(applied.closest('li')!.textContent).toContain('Aplicado');
      expect(applied.closest('li')!.textContent).toMatch(
        /3 cotas a R\$\s?94,50/,
      );
      // A alternativa é outra compra e continua disponível.
      expect(button('apply-fallback-HGLG11-HGCR11')!.disabled).toBe(false);
    });

    it('deve mostrar o erro da API no modal sem marcar o item', () => {
      serviceMock.applySuggestionItem.and.returnValue(
        throwError(() => ({
          status: 409,
          error: { error: 'Item já aplicado na carteira' },
        })),
      );
      open('apply-item-HGLG11');

      confirmButton().click();
      fixture.detectChanges();

      expect(
        modal()!.querySelector('[data-testid="apply-error"]')?.textContent,
      ).toContain('Item já aplicado na carteira');
      expect(
        fixture.componentInstance.suggestion()?.appliedItems,
      ).toBeUndefined();
    });

    it('deve mostrar erro genérico quando a API não explica a falha', () => {
      serviceMock.applySuggestionItem.and.returnValue(
        throwError(() => ({ status: 500 })),
      );
      open('apply-item-HGLG11');

      confirmButton().click();
      fixture.detectChanges();

      expect(
        modal()!.querySelector('[data-testid="apply-error"]')?.textContent,
      ).toContain('Não foi possível aplicar');
    });

    it('não deve fechar o modal enquanto a compra é aplicada', () => {
      const pending = new Subject<AiSuggestion>();
      serviceMock.applySuggestionItem.and.returnValue(pending);
      open('apply-item-HGLG11');

      confirmButton().click();
      fixture.detectChanges();
      (
        modal()!.querySelector(
          '[data-testid="confirm-dialog-cancel"]',
        ) as HTMLButtonElement
      ).click();
      fixture.componentInstance.closeApply();
      fixture.detectChanges();

      expect(modal()).not.toBeNull();
      expect(confirmButton().disabled).toBe(true);

      pending.next({ ...suggestion, appliedItems: [] });
      pending.complete();
      fixture.detectChanges();

      expect(modal()).toBeNull();
    });
  });

  // Regressão: a validação do aporte mora no painel (#310), mas o erro é do
  // contexto carteira/mês/aba. Sem isso ele sobrevive à troca e fica sobre uma
  // sugestão que nada tem a ver com ele.
  it('deve limpar o erro de aporte inválido ao trocar de carteira', () => {
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="contribution-input"]',
    ) as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new Event('input'));

    clickGenerate();

    expect(
      fixture.nativeElement.querySelector('[data-testid="suggestion-error"]')
        .textContent,
    ).toContain('Informe um valor de aporte válido.');

    fixture.componentInstance.selectWallet('wallet-2');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="suggestion-error"]'),
    ).toBeNull();
  });

  // Sair da tela com uma requisição em voo deixava a resposta escrever em
  // signals de um componente já destruído (#353).
  it('não deve aplicar a lista que chega depois de destruir o componente', () => {
    const pendente = new Subject<RecommendedWallet[]>();
    serviceMock.list.and.returnValue(pendente.asObservable());

    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.recommendedWallets()).toEqual([]);

    fixture.destroy();
    pendente.next([wallet]);

    expect(component.recommendedWallets()).toEqual([]);
  });

  it('não deve aplicar as carteiras do usuário que chegam depois de destruir', () => {
    const pendente = new Subject<Wallet[]>();
    walletServiceMock.list.and.returnValue(pendente.asObservable());

    fixture.detectChanges();
    const component = fixture.componentInstance;

    fixture.destroy();
    pendente.next([userWallet]);

    expect(component.wallets()).toEqual([]);
  });
});
