import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SimulationService } from './simulation.service';

describe('SimulationService', () => {
  let service: SimulationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SimulationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('deve listar as carteiras sugeridas disponíveis', () => {
    service.listWallets().subscribe();

    const request = httpMock.expectOne('/api/simulations/wallets');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('deve simular a carteira sugerida com valor, horizonte e modo', () => {
    service
      .simulateWallet({
        amount: '1.500,55',
        months: 12,
        mode: 'reinvest',
        provider: 'bb-fii',
        month: '2026-09',
        tab: 'renda',
      })
      .subscribe();

    const request = httpMock.expectOne('/api/simulations/wallet');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      amount: '1.500,55',
      months: 12,
      mode: 'reinvest',
      provider: 'bb-fii',
      month: '2026-09',
      tab: 'renda',
    });
    request.flush({});
  });

  it('deve omitir os campos opcionais não informados', () => {
    service
      .simulateWallet({ amount: '100', months: 1, mode: 'withdraw' })
      .subscribe();

    const request = httpMock.expectOne('/api/simulations/wallet');
    expect(request.request.body).toEqual({
      amount: '100',
      months: 1,
      mode: 'withdraw',
    });
    request.flush({});
  });
});
