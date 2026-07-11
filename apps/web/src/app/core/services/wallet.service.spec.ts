import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { WalletService } from './wallet.service';
import { Wallet } from 'dindin-models';

describe('WalletService', () => {
  let service: WalletService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WalletService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve criar uma carteira', () => {
    const payload = { name: 'Carteira Principal', currency: 'BRL' };
    const wallet: Wallet = {
      id: 'new-wallet-id',
      ownerId: 'user-123',
      name: 'Carteira Principal',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    service.create(payload).subscribe((response) => {
      expect(response).toEqual(wallet);
    });

    const req = httpMock.expectOne('/api/wallets');
    expect(req.request.method).toBe('POST');
    req.flush(wallet);
  });

  it('deve listar carteiras', () => {
    const wallets: Wallet[] = [
      {
        id: 'wallet-1',
        ownerId: 'user-123',
        name: 'Carteira Principal',
        currency: 'BRL',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    service.list().subscribe((response) => {
      expect(response).toEqual(wallets);
    });

    const req = httpMock.expectOne('/api/wallets');
    expect(req.request.method).toBe('GET');
    req.flush(wallets);
  });
});
