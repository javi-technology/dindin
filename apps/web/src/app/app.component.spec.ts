import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let authServiceMock: {
    user: ReturnType<typeof signal>;
    logout: jasmine.Spy;
  };

  beforeEach(async () => {
    authServiceMock = {
      user: signal<{ email: string } | null>(null),
      logout: jasmine.createSpy('logout').and.resolveTo(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
  });

  it('deve exibir navegação entre dashboard, carteira, geladeira e proventos quando autenticado', () => {
    authServiceMock.user.set({ email: 'user@dindin.app' });

    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="main-nav"] a'),
    ).map((link) => (link as HTMLAnchorElement).textContent?.trim());

    expect(links).toEqual(['Dashboard', 'Carteira', 'Geladeira', 'Proventos']);
  });

  it('não deve exibir navegação quando não autenticado', () => {
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="main-nav"]'),
    ).toBeFalsy();
  });
});
