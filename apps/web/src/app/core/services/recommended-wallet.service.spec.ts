import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { RecommendedWallet, RecommendedWalletComparison } from 'dindin-models';
import { RecommendedWalletService } from './recommended-wallet.service';

describe('RecommendedWalletService', () => {
  let service: RecommendedWalletService;
  let httpMock: HttpTestingController;

  const wallet: RecommendedWallet = {
    id: 'bb-fii_2026-09',
    provider: 'BB',
    month: '2026-09',
    revision: 2,
    publishedAt: '2026-09-02',
    sourceFile: 'wallets/fii-bb/CartFII_Set26_2.pdf',
    status: 'pending_review',
    renda: [],
    ganho: [],
    parsedAt: '2026-09-04T00:00:00Z',
    createdAt: '2026-09-04T00:00:00Z',
    updatedAt: '2026-09-04T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RecommendedWalletService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve listar carteiras recomendadas', () => {
    service.list().subscribe((result) => expect(result).toEqual([wallet]));

    const request = httpMock.expectOne('/api/recommended-wallets/bb-fii');
    expect(request.request.method).toBe('GET');
    request.flush([wallet]);
  });

  it('deve buscar a carteira mais recente ou de um mês específico', () => {
    service
      .latest('2026-09')
      .subscribe((result) => expect(result).toEqual(wallet));

    const request = httpMock.expectOne(
      '/api/recommended-wallets/bb-fii/latest?month=2026-09',
    );
    expect(request.request.method).toBe('GET');
    request.flush(wallet);
  });

  it('deve comparar carteira usando a aba informada', () => {
    const comparison = {
      recommended: wallet,
      items: [],
      totalValue: 0,
    } satisfies RecommendedWalletComparison;

    service
      .compare('wallet-1', '2026-09', 'ganho')
      .subscribe((result) => expect(result).toEqual(comparison));

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/recommended-wallets/bb-fii/compare/wallet-1' &&
        candidate.params.get('month') === '2026-09' &&
        candidate.params.get('wallet') === 'ganho',
    );
    expect(request.request.method).toBe('GET');
    request.flush(comparison);
  });

  it('deve confirmar uma carteira', () => {
    service
      .confirm(wallet.id)
      .subscribe((result) => expect(result).toEqual(wallet));

    const request = httpMock.expectOne(
      `/api/admin/recommended-wallets/bb-fii/${wallet.id}/confirm`,
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    request.flush(wallet);
  });

  it('deve importar o conteúdo base64 de um PDF', () => {
    service
      .import('CartFII_Set26_2.pdf', 'cGRm')
      .subscribe((result) => expect(result).toEqual(wallet));

    const request = httpMock.expectOne(
      '/api/admin/recommended-wallets/bb-fii/import',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      fileName: 'CartFII_Set26_2.pdf',
      contentBase64: 'cGRm',
    });
    request.flush(wallet);
  });
});
