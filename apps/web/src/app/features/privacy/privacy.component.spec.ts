import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrivacyComponent } from './privacy.component';
import { routes } from '../../app.routes';

describe('PrivacyComponent', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PrivacyComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('deve ter o título da política de privacidade', () => {
    const h1 = render().querySelector('h1');
    expect(h1?.textContent).toContain('Política de privacidade');
  });

  it('deve descrever o tratamento dos dados financeiros', () => {
    const texto = render().textContent ?? '';
    expect(texto).toContain('dados financeiros');
    expect(texto).toContain('carteira');
    expect(texto).toContain('não vendemos');
  });

  it('deve informar os dados coletados pelas lojas e pelo push', () => {
    const texto = render().textContent ?? '';
    expect(texto).toContain('e-mail');
    expect(texto).toContain('token de notificação');
  });

  it('deve ser rota pública, sem guard de autenticação', () => {
    const rota = routes.find((r) => r.path === 'privacidade');
    expect(rota).toBeTruthy();
    expect(rota?.canActivate).toBeUndefined();
  });
});
