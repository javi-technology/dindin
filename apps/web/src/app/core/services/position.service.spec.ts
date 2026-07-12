import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PositionService } from './position.service';
import { Position } from 'dindin-models';

describe('PositionService', () => {
  let service: PositionService;
  let httpMock: HttpTestingController;
  const walletId = 'wallet-1';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PositionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve listar posições de uma carteira', () => {
    const positions: Position[] = [
      {
        id: 'position-1',
        walletId,
        ticker: 'HGLG11',
        assetType: 'FII',
        quantity: 10,
        averagePrice: 110.5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    service.list(walletId).subscribe((response) => {
      expect(response).toEqual(positions);
    });

    const req = httpMock.expectOne(`/api/wallets/${walletId}/positions`);
    expect(req.request.method).toBe('GET');
    req.flush(positions);
  });

  it('deve criar uma posição', () => {
    const payload = {
      ticker: 'HGLG11',
      assetType: 'FII' as const,
      quantity: 10,
      averagePrice: 110.5,
    };

    service.create(walletId, payload).subscribe((response) => {
      expect(response.id).toBe('new-position-id');
      expect(response.ticker).toBe('HGLG11');
    });

    const req = httpMock.expectOne(`/api/wallets/${walletId}/positions`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'new-position-id', ...payload });
  });

  it('deve atualizar uma posição', () => {
    const positionId = 'position-1';
    const payload = { quantity: 20 };

    service.update(walletId, positionId, payload).subscribe((response) => {
      expect(response.id).toBe(positionId);
      expect(response.quantity).toBe(20);
    });

    const req = httpMock.expectOne(
      `/api/wallets/${walletId}/positions/${positionId}`,
    );
    expect(req.request.method).toBe('PUT');
    req.flush({ id: positionId, ...payload });
  });

  it('deve remover uma posição', () => {
    const positionId = 'position-1';

    service.delete(walletId, positionId).subscribe(() => {
      expect(true).toBe(true);
    });

    const req = httpMock.expectOne(
      `/api/wallets/${walletId}/positions/${positionId}`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
