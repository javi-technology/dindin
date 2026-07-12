import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HomeComponent } from './home.component';
import { HealthService } from '../../core/services/health.service';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let healthServiceMock: jasmine.SpyObj<HealthService>;

  beforeEach(async () => {
    healthServiceMock = jasmine.createSpyObj('HealthService', ['check']);

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: HealthService, useValue: healthServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
  });

  it('deve exibir status do backend quando saudável', () => {
    healthServiceMock.check.and.returnValue(
      of({ status: 'ok', project: 'dindin' }),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.healthStatus).toBe('ok');
    expect(fixture.componentInstance.healthProject).toBe('dindin');
    expect(healthServiceMock.check).toHaveBeenCalled();
  });

  it('deve exibir mensagem de erro quando falhar ao conectar ao backend', () => {
    healthServiceMock.check.and.returnValue(
      throwError(() => new Error('network error')),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.healthError).toBe('network error');
  });
});
