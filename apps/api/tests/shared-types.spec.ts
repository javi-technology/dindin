import { DividendCreateRequest, DividendResponse } from 'dindin-shared-types';

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
