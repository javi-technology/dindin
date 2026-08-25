import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HomeComponent } from './home.component';
import { HealthService } from '../../core/services/health.service';
import { AuthService } from '../../core/services/auth.service';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let healthServiceMock: jasmine.SpyObj<HealthService>;
  let authServiceMock: { isAdmin: jasmine.Spy };

  beforeEach(async () => {
    healthServiceMock = jasmine.createSpyObj('HealthService', ['check']);
    authServiceMock = { isAdmin: jasmine.createSpy('isAdmin') };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: HealthService, useValue: healthServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
  });

  it('deve exibir status do backend quando saudável', () => {
    healthServiceMock.check.and.returnValue(
      of({ status: 'ok', project: 'dindin' }),
    );
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));

    fixture.detectChanges();

    expect(fixture.componentInstance.healthStatus).toBe('ok');
    expect(fixture.componentInstance.healthProject).toBe('dindin');
    expect(healthServiceMock.check).toHaveBeenCalled();
  });

  it('deve exibir mensagem de erro quando falhar ao conectar ao backend', () => {
    healthServiceMock.check.and.returnValue(
      throwError(() => new Error('network error')),
    );
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));

    fixture.detectChanges();

    expect(fixture.componentInstance.healthError).toBe('network error');
  });

  it('deve exibir link admin quando usuário é admin', fakeAsync(() => {
    healthServiceMock.check.and.returnValue(
      of({ status: 'ok', project: 'dindin' }),
    );
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(true));

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.isAdmin()).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('[data-testid="admin-link"]'),
    ).toBeTruthy();
  }));

  it('não deve exibir link admin quando usuário não é admin', fakeAsync(() => {
    healthServiceMock.check.and.returnValue(
      of({ status: 'ok', project: 'dindin' }),
    );
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.isAdmin()).toBeFalse();
    expect(
      fixture.nativeElement.querySelector('[data-testid="admin-link"]'),
    ).toBeFalsy();
  }));
});
