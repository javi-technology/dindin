import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component, signal } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';

@Component({ selector: 'app-stub', standalone: true, template: '' })
class StubComponent {}

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
        provideRouter([{ path: 'carteira', component: StubComponent }]),
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

  it('deve destacar a rota ativa sobrepondo a cor base do link', fakeAsync(() => {
    authServiceMock.user.set({ email: 'user@dindin.app' });
    fixture.detectChanges();

    TestBed.inject(Router).navigate(['/carteira']);
    tick();
    fixture.detectChanges();

    const active = fixture.nativeElement.querySelector(
      '[data-testid="main-nav"] a[href="/carteira"]',
    ) as HTMLAnchorElement;

    expect(active.classList).toContain('!text-blue-600');
  }));

  it('não deve exibir navegação quando não autenticado', () => {
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="main-nav"]'),
    ).toBeFalsy();
  });
});
