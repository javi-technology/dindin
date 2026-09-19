import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SetupService } from './setup.service';

describe('SetupService (#275)', () => {
  let service: SetupService;
  let httpMock: HttpTestingController;
  let consoleErrorSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SetupService);
    httpMock = TestBed.inject(HttpTestingController);
    consoleErrorSpy = spyOn(console, 'error');
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve provisionar os padrões uma única vez por sessão', async () => {
    const first = service.ensureDefaults('user-123');
    const second = service.ensureDefaults('user-123');

    const req = httpMock.expectOne('/api/me/setup');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ walletCreated: true, fridgeCreated: true });

    await expectAsync(first).toBeResolved();
    await expectAsync(second).toBeResolved();

    await service.ensureDefaults('user-123');
    httpMock.expectNone('/api/me/setup');
  });

  it('deve provisionar de novo quando outro usuário entrar', async () => {
    const first = service.ensureDefaults('user-123');
    httpMock
      .expectOne('/api/me/setup')
      .flush({ walletCreated: false, fridgeCreated: false });
    await first;

    const other = service.ensureDefaults('user-456');
    httpMock
      .expectOne('/api/me/setup')
      .flush({ walletCreated: true, fridgeCreated: true });

    await expectAsync(other).toBeResolved();
  });

  it('deve logar a falha sem bloquear a navegação', async () => {
    const pending = service.ensureDefaults('user-123');

    httpMock
      .expectOne('/api/me/setup')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    await expectAsync(pending).toBeResolved();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('deve pedir explicitamente um recurso padrão', () => {
    service.createDefault('wallet').subscribe((response) => {
      expect(response).toEqual({ walletCreated: true, fridgeCreated: false });
    });

    const req = httpMock.expectOne('/api/me/setup');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ resource: 'wallet' });
    req.flush({ walletCreated: true, fridgeCreated: false });
  });
});
