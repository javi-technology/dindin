import {
  CreateFridgeItemRequest,
  CreatePositionRequest,
  CreateWalletRequest,
  DividendCreateRequest,
  DividendHistoryBatchResponse,
  DividendHistoryResponse,
  DividendResponse,
  DividendYieldResponse,
  MonthlyDividendReport,
  MonthlyIncomeResponse,
  MoveToFridgeRequest,
  UnfreezeItemRequest,
  UpdatePositionRequest,
} from 'dindin-shared-types';

// ---------------------------------------------------------------------------
// Testes de contrato dos tipos compartilhados (issue #14)
// Valida que os tipos exportados possuem os campos esperados para criação e
// resposta de proventos.
// ---------------------------------------------------------------------------

describe('shared-types – DividendCreateRequest', () => {
  it('deve aceitar um DividendCreateRequest válido sem totalAmount', () => {
    const request: DividendCreateRequest = {
      ticker: 'HGLG11',
      assetType: 'FII',
      amountPerShare: 0.82,
      quantity: 100,
      paymentDate: '2026-01-15',
    };

    expect(request.ticker).toBe('HGLG11');
    expect(request.amountPerShare).toBe(0.82);
    expect(request.quantity).toBe(100);
    expect(request.totalAmount).toBeUndefined();
    expect(request.paymentDate).toBe('2026-01-15');
  });

  it('deve aceitar assetType opcional', () => {
    const request: DividendCreateRequest = {
      ticker: 'MXRF11',
      amountPerShare: 0.1,
      quantity: 500,
      paymentDate: '2026-02-10',
    };

    expect(request.assetType).toBeUndefined();
  });
});

describe('shared-types – DividendResponse', () => {
  it('deve aceitar um DividendResponse válido', () => {
    const response: DividendResponse = {
      id: 'div-1',
      userId: 'user-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      amountPerShare: 0.82,
      quantity: 100,
      totalAmount: 82,
      paymentDate: '2026-01-15',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
    };

    expect(response.id).toBe('div-1');
    expect(response.userId).toBe('user-1');
    expect(response.ticker).toBe('HGLG11');
  });
});

// ---------------------------------------------------------------------------
// Contratos de carteira, posição, geladeira e proventos (issue #313)
//
// Estavam redeclarados à mão nos serviços do frontend, enquanto a API tinha as
// suas próprias interfaces para as mesmas respostas. Um campo renomeado na API
// só aparecia em produção. Estes testes falham na compilação se os dois lados
// divergirem.
// ---------------------------------------------------------------------------

describe('shared-types – contratos de carteira e posição', () => {
  it('deve descrever a criação de carteira', () => {
    const request: CreateWalletRequest = {
      name: 'Carteira Principal',
      currency: 'BRL',
      description: 'Ativos de renda',
    };

    expect(request.currency).toBe('BRL');
  });

  it('deve descrever a criação e atualização de posição', () => {
    const request: CreatePositionRequest = {
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: 110.5,
    };
    // `null` remove o preço-alvo gravado.
    const update: UpdatePositionRequest = { targetPrice: null };

    expect(request.ticker).toBe('HGLG11');
    expect(update.targetPrice).toBeNull();
  });

  it('deve descrever a movimentação para a geladeira', () => {
    const request: MoveToFridgeRequest = {
      fridgeId: 'fridge-1',
      targetPrice: 120,
    };
    const unfreeze: UnfreezeItemRequest = { walletId: 'wallet-1' };

    expect(request.fridgeId).toBe('fridge-1');
    expect(unfreeze.walletId).toBe('wallet-1');
  });

  it('deve descrever a criação de item da geladeira', () => {
    const request: CreateFridgeItemRequest = {
      ticker: 'HGLG11',
      quantity: 5,
      transferredPrice: 95,
      targetPrice: 90,
    };

    expect(request.targetPrice).toBe(90);
  });
});

describe('shared-types – contratos de proventos', () => {
  it('deve descrever a renda mensal, com o recorte gratuito', () => {
    const response: MonthlyIncomeResponse = {
      byTicker: [
        {
          ticker: 'HGLG11',
          quantity: 10,
          monthlyDividend: 1.1,
          monthlyIncome: 11,
          paymentDate: '2026-09-15',
        },
      ],
      total: 11,
      totalFromFridge: 0,
      limited: true,
      scheduleItems: [],
      scheduleTotals: { upcomingTotal: 11, paidTotal: 0 },
      hiddenTickers: ['XPML11'],
      hiddenPaymentDates: ['2026-09-20'],
      hiddenScheduleTickers: ['KNCR11'],
    };

    expect(response.total).toBe(11);
  });

  it('deve descrever o dividend yield da carteira', () => {
    const response: DividendYieldResponse = {
      byTicker: [
        {
          ticker: 'HGLG11',
          annualIncome: 13.2,
          currentValue: 1105,
          yield: 1.2,
        },
      ],
      total: { annualIncome: 13.2, currentValue: 1105, yield: 1.2 },
    };

    expect(response.byTicker).toHaveLength(1);
  });

  it('deve descrever o relatório mensal', () => {
    const report: MonthlyDividendReport = {
      year: 2026,
      months: [{ month: '2026-09', total: 11, byTicker: [] }],
      byTicker: [{ ticker: 'HGLG11', total: 11 }],
      total: 11,
      availableYears: [2026],
    };

    expect(report.year).toBe(2026);
  });

  it('deve descrever o histórico de proventos', () => {
    const single: DividendHistoryResponse = {
      ticker: 'HGLG11',
      history: [{ date: '2026-09', monthlyDividend: 1.1 }],
    };
    const batch: DividendHistoryBatchResponse = {
      byTicker: { HGLG11: [{ date: '2026-09', monthlyDividend: 1.1 }] },
    };

    expect(single.history).toHaveLength(1);
    expect(batch.byTicker.HGLG11).toHaveLength(1);
  });
});
