import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminAssetsComponent } from './admin-assets.component';
import { AssetService } from '../../core/services/asset.service';
import { Asset } from 'dindin-models';

describe('AdminAssetsComponent', () => {
  let fixture: ComponentFixture<AdminAssetsComponent>;
  let assetServiceMock: jasmine.SpyObj<AssetService>;

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

  beforeEach(async () => {
    assetServiceMock = jasmine.createSpyObj('AssetService', ['list', 'create']);
    assetServiceMock.list.and.returnValue(of(assets));
    assetServiceMock.create.and.returnValue(of(assets[0]));

    await TestBed.configureTestingModule({
      imports: [AdminAssetsComponent],
      providers: [
        provideRouter([]),
        { provide: AssetService, useValue: assetServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminAssetsComponent);
  });

  it('deve criar o componente', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('deve listar ativos ao inicializar', () => {
    fixture.detectChanges();

    expect(assetServiceMock.list).toHaveBeenCalled();
    expect(fixture.componentInstance.assets()).toEqual(assets);
  });

  it('deve criar um ativo ao submeter o formulário válido', fakeAsync(() => {
    const created: Asset = {
      ticker: 'ITUB4',
      name: 'Itaú Unibanco',
      assetType: 'STOCK',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    assetServiceMock.create.and.returnValue(of(created));

    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.form.setValue({
      ticker: 'ITUB4',
      name: 'Itaú Unibanco',
      assetType: 'STOCK',
      active: true,
    });

    component.saveAsset();
    tick();

    expect(assetServiceMock.create).toHaveBeenCalledWith({
      ticker: 'ITUB4',
      name: 'Itaú Unibanco',
      assetType: 'STOCK',
      active: true,
    });
    expect(component.successMessage()).toBe(
      'Ativo ITUB4 cadastrado com sucesso.',
    );
    expect(component.formError()).toBeNull();
  }));

  it('deve exibir erro quando a criação falhar', fakeAsync(() => {
    assetServiceMock.create.and.returnValue(
      throwError(() => ({ error: { error: 'Asset already exists' } })),
    );
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.setValue({
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      assetType: 'FII',
      active: true,
    });

    component.saveAsset();
    tick();

    expect(component.formError()).toBe('Asset already exists');
    expect(component.successMessage()).toBeNull();
  }));
});
