import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RateLimitNoticeService } from '../../../core/services/rate-limit-notice.service';
import { RateLimitNoticeComponent } from './rate-limit-notice.component';

describe('RateLimitNoticeComponent', () => {
  let fixture: ComponentFixture<RateLimitNoticeComponent>;
  let notice: RateLimitNoticeService;

  const el = (): HTMLElement => fixture.nativeElement;
  const banner = () => el().querySelector('[data-testid="rate-limit-notice"]');

  beforeEach(() => {
    notice = TestBed.inject(RateLimitNoticeService);
    fixture = TestBed.createComponent(RateLimitNoticeComponent);
    fixture.detectChanges();
  });

  afterEach(() => notice.dismiss());

  it('não deve mostrar nada sem 429', () => {
    expect(banner()).toBeNull();
  });

  it('deve avisar a espera em pt-BR, como status acessível', () => {
    notice.show(42);
    fixture.detectChanges();

    expect(banner()?.getAttribute('role')).toBe('status');
    expect(banner()?.textContent).toContain(
      'Muitas requisições. Aguarde 42 segundos e tente de novo.',
    );
  });

  it('deve sumir quando o aviso é dispensado', () => {
    notice.show(42);
    fixture.detectChanges();

    (
      el().querySelector('[data-testid="rate-limit-dismiss"]') as HTMLElement
    ).click();
    fixture.detectChanges();

    expect(banner()).toBeNull();
  });
});
