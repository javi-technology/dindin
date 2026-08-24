import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DividendComponent } from './dividend.component';
import {
  DividendService,
  DividendProjectionResponse,
  MonthlyDividendProjection,
} from '../../core/services/dividend.service';

describe('DividendComponent', () => {
  let fixture: ComponentFixture<DividendComponent>;
  let dividendServiceMock: jasmine.SpyObj<DividendService>;

  const projections: MonthlyDividendProjection[] = [
    {
      ticker: 'HGLG11',
      amountPerShare: 0.9,
      quantity: 150,
      monthlyAmount: 135,
    },
    { ticker: 'XPLG11', amountPerShare: 0.7, quantity: 50, monthlyAmount: 35 },
  ];

  const response: DividendProjectionResponse = {
    projections,
    total: 170,
  };

  beforeEach(async () => {
    dividendServiceMock = jasmine.createSpyObj('DividendService', [
      'getProjection',
    ]);
    dividendServiceMock.getProjection.and.returnValue(of(response));

    await TestBed.configureTestingModule({
      imports: [DividendComponent],
      providers: [{ provide: DividendService, useValue: dividendServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(DividendComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('deve chamar serviço de projeção ao inicializar', () => {
    expect(dividendServiceMock.getProjection).toHaveBeenCalled();
  });

  it('deve exibir projeção mensal total', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const totalValue = compiled.querySelector('[data-testid="total-value"]');
    expect(totalValue?.textContent).toContain('R$');
    expect(totalValue?.textContent).toContain('170,00');
  });

  it('deve listar projeções por ticker', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('HGLG11');
    expect(rows[1].textContent).toContain('XPLG11');
  });

  it('deve exibir mensagem de erro quando falha ao carregar projeção', async () => {
    TestBed.resetTestingModule();
    const isolatedDividendServiceMock = jasmine.createSpyObj(
      'DividendService',
      ['getProjection'],
    );
    isolatedDividendServiceMock.getProjection.and.returnValue(
      throwError(() => new Error('Network error')),
    );

    await TestBed.configureTestingModule({
      imports: [DividendComponent],
      providers: [
        { provide: DividendService, useValue: isolatedDividendServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DividendComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorEl = compiled.querySelector('[data-testid="error-message"]');
    expect(errorEl?.textContent).toContain('Erro ao carregar projeção');
  });
});
