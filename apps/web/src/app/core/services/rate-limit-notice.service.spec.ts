import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { RateLimitNoticeService } from './rate-limit-notice.service';

describe('RateLimitNoticeService', () => {
  let service: RateLimitNoticeService;

  beforeEach(() => {
    service = TestBed.inject(RateLimitNoticeService);
  });

  it('deve começar sem aviso', () => {
    expect(service.waitSeconds()).toBeNull();
  });

  it('deve mostrar o aviso com a espera pedida', () => {
    service.show(30);

    expect(service.waitSeconds()).toBe(30);
  });

  it('deve sumir sozinho quando a espera acaba', fakeAsync(() => {
    service.show(30);

    tick(29_000);
    expect(service.waitSeconds()).toBe(30);

    tick(1_000);
    expect(service.waitSeconds()).toBeNull();
  }));

  it('deve reiniciar a contagem quando um novo 429 chega', fakeAsync(() => {
    service.show(10);
    tick(8_000);

    service.show(10);
    tick(8_000);

    expect(service.waitSeconds()).toBe(10);
    tick(2_000);
    expect(service.waitSeconds()).toBeNull();
  }));

  it('deve poder ser dispensado antes do fim', fakeAsync(() => {
    service.show(30);

    service.dismiss();

    expect(service.waitSeconds()).toBeNull();
    tick(30_000);
  }));
});
