import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SparklineComponent } from './sparkline.component';

describe('SparklineComponent', () => {
  let fixture: ComponentFixture<SparklineComponent>;

  const element = (): HTMLElement => fixture.nativeElement;
  const svg = (): Element | null =>
    element().querySelector('[data-testid="sparkline"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SparklineComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SparklineComponent);
  });

  it('não deve renderizar nada com menos de dois pontos', () => {
    fixture.componentRef.setInput('values', [1.2]);
    fixture.detectChanges();

    expect(svg()).toBeNull();
  });

  it('não deve renderizar nada sem pontos', () => {
    fixture.componentRef.setInput('values', []);
    fixture.detectChanges();

    expect(svg()).toBeNull();
  });

  it('deve desenhar uma linha com um ponto por valor', () => {
    fixture.componentRef.setInput('values', [1, 2, 3]);
    fixture.detectChanges();

    const pontos = svg()
      ?.querySelector('polyline')
      ?.getAttribute('points')
      ?.trim()
      .split(/\s+/);

    expect(pontos?.length).toBe(3);
  });

  it('deve desenhar o maior valor acima do menor', () => {
    fixture.componentRef.setInput('values', [1, 3]);
    fixture.detectChanges();

    const [primeiro, segundo] = svg()!
      .querySelector('polyline')!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((par) => Number(par.split(',')[1]));

    // Em SVG o eixo Y cresce para baixo, então o maior valor tem Y menor.
    expect(segundo).toBeLessThan(primeiro);
  });

  it('deve desenhar linha reta quando todos os valores são iguais', () => {
    fixture.componentRef.setInput('values', [2, 2, 2]);
    fixture.detectChanges();

    const ys = svg()!
      .querySelector('polyline')!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((par) => Number(par.split(',')[1]));

    expect(ys.every((y) => Number.isFinite(y))).toBe(true);
    expect(new Set(ys).size).toBe(1);
  });

  it('deve marcar o último ponto sem distorção horizontal', () => {
    fixture.componentRef.setInput('values', [1, 2, 3]);
    fixture.detectChanges();

    // Com preserveAspectRatio="none" um <circle> vira elipse achatada, então
    // o marcador é desenhado como retângulo arredondado.
    expect(svg()?.querySelector('circle')).toBeNull();
    const marcador = svg()?.querySelector('[data-testid="sparkline-last"]');
    expect(marcador).toBeTruthy();
  });

  it('deve aplicar o aria-label informado', () => {
    fixture.componentRef.setInput('values', [1, 2]);
    fixture.componentRef.setInput('ariaLabel', 'Histórico do HGLG11');
    fixture.detectChanges();

    expect(svg()?.getAttribute('role')).toBe('img');
    expect(svg()?.getAttribute('aria-label')).toBe('Histórico do HGLG11');
  });
});
