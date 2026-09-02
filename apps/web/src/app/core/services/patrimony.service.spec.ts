import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PatrimonySnapshot } from 'dindin-models';
import { PatrimonyService } from './patrimony.service';

describe('PatrimonyService', () => {
  let service: PatrimonyService;
  let httpMock: HttpTestingController;

  const snapshot: PatrimonySnapshot = {
    id: '2026-08-27',
    userId: 'user-1',
    date: '2026-08-27',
    totalWallet: 100,
    totalFridge: 20,
    total: 120,
    createdAt: '2026-08-27T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PatrimonyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve buscar o histórico sem limite', () => {
    service.getHistory().subscribe((result) => {
      expect(result).toEqual([snapshot]);
    });

    const request = httpMock.expectOne('/api/patrimony/history');
    expect(request.request.method).toBe('GET');
    request.flush([snapshot]);
  });

  it('deve anexar limite ao buscar o histórico', () => {
    service.getHistory(30).subscribe();

    const request = httpMock.expectOne('/api/patrimony/history?limit=30');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('deve registrar um snapshot', () => {
    service.recordSnapshot().subscribe((result) => {
      expect(result).toEqual(snapshot);
    });

    const request = httpMock.expectOne('/api/patrimony/snapshots');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush(snapshot);
  });
});
