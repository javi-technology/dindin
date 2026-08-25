import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AssetService } from './asset.service';
import { Asset } from 'dindin-models';

describe('AssetService', () => {
  let service: AssetService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssetService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve listar os ativos do catálogo', () => {
    const assets: Asset[] = [
      {
        ticker: 'HGLG11',
        name: 'CSHG Logística',
        assetType: 'FII',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    service.list().subscribe((response) => {
      expect(response).toEqual(assets);
    });

    const req = httpMock.expectOne('/api/assets');
    expect(req.request.method).toBe('GET');
    req.flush(assets);
  });
});
