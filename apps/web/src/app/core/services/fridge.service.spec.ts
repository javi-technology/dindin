import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { FridgeService } from './fridge.service';
import { Fridge, FridgeItem } from 'dindin-models';

describe('FridgeService', () => {
  let service: FridgeService;
  let httpMock: HttpTestingController;

  const fridge: Fridge = {
    id: 'fridge-1',
    ownerId: 'user-123',
    name: 'Geladeira Principal',
    description: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const items: FridgeItem[] = [
    {
      id: 'item-1',
      fridgeId: 'fridge-1',
      ticker: 'HGLG11',
      quantity: 10,
      transferredPrice: 100,
      targetPrice: 90,
      currentPrice: 95,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FridgeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve listar geladeiras', () => {
    service.listFridges().subscribe((response) => {
      expect(response).toEqual([fridge]);
    });

    const req = httpMock.expectOne('/api/fridges');
    expect(req.request.method).toBe('GET');
    req.flush([fridge]);
  });

  it('deve listar itens de uma geladeira', () => {
    service.listItems('fridge-1').subscribe((response) => {
      expect(response).toEqual(items);
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1/items');
    expect(req.request.method).toBe('GET');
    req.flush(items);
  });

  it('deve atualizar um item da geladeira', () => {
    const updated: FridgeItem = { ...items[0], targetPrice: 85 };

    service
      .updateItem('fridge-1', 'item-1', { targetPrice: 85 })
      .subscribe((response) => {
        expect(response).toEqual(updated);
      });

    const req = httpMock.expectOne('/api/fridges/fridge-1/items/item-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ targetPrice: 85 });
    req.flush(updated);
  });

  it('deve remover um item da geladeira', () => {
    service.deleteItem('fridge-1', 'item-1').subscribe((response) => {
      expect(response).toBeNull();
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1/items/item-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
