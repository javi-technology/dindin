import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { FridgeService } from './fridge.service';
import { Fridge, FridgeItem, Position } from 'dindin-models';

describe('FridgeService', () => {
  let service: FridgeService;
  let httpMock: HttpTestingController;

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

  // --- Fridge CRUD ---

  it('deve listar geladeiras', () => {
    const fridges: Fridge[] = [
      {
        id: 'fridge-1',
        ownerId: 'user-123',
        name: 'Geladeira Principal',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    service.listFridges().subscribe((response) => {
      expect(response).toEqual(fridges);
    });

    const req = httpMock.expectOne('/api/fridges');
    expect(req.request.method).toBe('GET');
    req.flush(fridges);
  });

  it('deve criar uma geladeira', () => {
    const payload = {
      name: 'Nova Geladeira',
      description: 'FIIs em observação',
    };
    const fridge: Fridge = {
      id: 'new-fridge-id',
      ownerId: 'user-123',
      name: 'Nova Geladeira',
      description: 'FIIs em observação',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    service.createFridge(payload).subscribe((response) => {
      expect(response).toEqual(fridge);
    });

    const req = httpMock.expectOne('/api/fridges');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(fridge);
  });

  it('deve obter uma geladeira por id', () => {
    const fridge: Fridge = {
      id: 'fridge-1',
      ownerId: 'user-123',
      name: 'Geladeira Principal',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    service.getFridge('fridge-1').subscribe((response) => {
      expect(response).toEqual(fridge);
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1');
    expect(req.request.method).toBe('GET');
    req.flush(fridge);
  });

  it('deve atualizar uma geladeira', () => {
    const payload = { name: 'Geladeira Atualizada' };
    const fridge: Fridge = {
      id: 'fridge-1',
      ownerId: 'user-123',
      name: 'Geladeira Atualizada',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };

    service.updateFridge('fridge-1', payload).subscribe((response) => {
      expect(response).toEqual(fridge);
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush(fridge);
  });

  it('deve deletar uma geladeira', () => {
    service.deleteFridge('fridge-1').subscribe(() => {
      expect(true).toBe(true);
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  // --- FridgeItem CRUD ---

  it('deve listar itens de uma geladeira', () => {
    const items: FridgeItem[] = [
      {
        id: 'item-1',
        fridgeId: 'fridge-1',
        ticker: 'HGLG11',
        quantity: 10,
        transferredPrice: 110.5,
        targetPrice: 120,
        currentPrice: 112,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    service.listItems('fridge-1').subscribe((response) => {
      expect(response).toEqual(items);
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1/items');
    expect(req.request.method).toBe('GET');
    req.flush(items);
  });

  it('deve criar um item na geladeira', () => {
    const payload = {
      ticker: 'HGLG11',
      quantity: 10,
      transferredPrice: 110.5,
      targetPrice: 120,
      currentPrice: 112,
    };

    service.createItem('fridge-1', payload).subscribe((response) => {
      expect(response.id).toBe('new-item-id');
      expect(response.ticker).toBe('HGLG11');
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1/items');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'new-item-id', fridgeId: 'fridge-1', ...payload });
  });

  it('deve atualizar um item da geladeira', () => {
    const payload = { targetPrice: 130 };

    service.updateItem('fridge-1', 'item-1', payload).subscribe((response) => {
      expect(response.id).toBe('item-1');
      expect(response.targetPrice).toBe(130);
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1/items/item-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'item-1', fridgeId: 'fridge-1', targetPrice: 130 });
  });

  it('deve deletar um item da geladeira', () => {
    service.deleteItem('fridge-1', 'item-1').subscribe(() => {
      expect(true).toBe(true);
    });

    const req = httpMock.expectOne('/api/fridges/fridge-1/items/item-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('deve descongelar item em uma carteira', () => {
    const position = {
      id: 'position-1',
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: 110.5,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as Position;

    service
      .unfreezeItem('fridge-1', 'item-1', 'wallet-1')
      .subscribe((response) => expect(response).toEqual(position));

    const req = httpMock.expectOne(
      '/api/fridges/fridge-1/items/item-1/unfreeze',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ walletId: 'wallet-1' });
    req.flush(position);
  });
});
