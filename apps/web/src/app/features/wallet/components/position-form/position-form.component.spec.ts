import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Asset, Position } from 'dindin-models';
import {
  PositionFormComponent,
  PositionFormValue,
} from './position-form.component';

// ---------------------------------------------------------------------------
// Testes do formulário de posição (issue #309)
//
// O formulário saiu do wallet.component com a lógica de variação de
// quantidade (+N/-N, #215) e o recálculo do preço médio, que só dizem respeito
// a ele. O componente não fala com a API: emite o payload e o pai salva.
// ---------------------------------------------------------------------------

describe('PositionFormComponent', () => {
  let fixture: ComponentFixture<PositionFormComponent>;
  let component: PositionFormComponent;
  let salvos: PositionFormValue[];
  let fechados: number;

  const assets: Asset[] = [
    {
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      assetType: 'FII',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const mxrf: Position = {
    id: 'position-mxrf',
    walletId: 'wallet-1',
    ticker: 'MXRF11',
    assetType: 'FII',
    quantity: 32,
    averagePrice: 9.18,
    inFridge: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function setup(position: Position | null = null): void {
    fixture = TestBed.createComponent(PositionFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('position', position);
    fixture.componentRef.setInput('assets', assets);
    salvos = [];
    fechados = 0;
    component.save.subscribe((value) => salvos.push(value));
    component.closed.subscribe(() => (fechados += 1));
    fixture.detectChanges();
  }

  function patch(values: Record<string, string>): void {
    component.form.patchValue(values);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PositionFormComponent],
    }).compileComponents();
  });

  describe('estado inicial', () => {
    it('deve começar vazio ao adicionar', () => {
      setup();

      expect(component.form.value).toEqual(
        expect.objectContaining({
          ticker: '',
          assetType: 'FII',
          quantity: '0',
          averagePrice: '0',
        }),
      );
    });

    it('deve preencher com a posição ao editar', () => {
      setup(mxrf);

      expect(component.form.value).toEqual(
        expect.objectContaining({
          ticker: 'MXRF11',
          assetType: 'FII',
          quantity: '32',
          averagePrice: '9.18',
        }),
      );
    });

    it('deve listar os ativos recebidos', () => {
      setup();

      const options = (fixture.nativeElement as HTMLElement).querySelectorAll(
        'select#ticker option',
      );

      // A primeira opção é o placeholder.
      expect(options.length).toBe(2);
      expect(options[1].textContent).toContain('MXRF11');
    });

    it('deve exibir o erro do catálogo de ativos', () => {
      setup();
      fixture.componentRef.setInput('assetsError', 'Erro ao carregar ativos.');
      fixture.detectChanges();

      expect(element('[data-testid="assets-error"]')?.textContent).toContain(
        'Erro ao carregar ativos.',
      );
    });

    it('deve exibir o erro recebido do pai', () => {
      setup();
      fixture.componentRef.setInput('error', 'Erro ao criar posição.');
      fixture.detectChanges();

      expect(element('[data-testid="form-error"]')?.textContent).toContain(
        'Erro ao criar posição.',
      );
    });
  });

  describe('validação', () => {
    it('não deve emitir save com o formulário inválido', () => {
      setup();
      patch({ ticker: '', quantity: '0', averagePrice: '0' });

      component.submit();

      expect(salvos).toEqual([]);
      expect(component.form.get('ticker')?.touched).toBe(true);
    });

    it('deve acusar preço médio com formato inválido', () => {
      setup();
      patch({ averagePrice: 'abc' });
      component.form.get('averagePrice')?.markAsTouched();
      fixture.detectChanges();

      expect(
        component.form.get('averagePrice')?.hasError('invalidDecimal'),
      ).toBe(true);
    });

    it('deve aceitar preço com vírgula como separador decimal', () => {
      setup();
      patch({ averagePrice: '110,50' });
      component.form.get('averagePrice')?.markAsTouched();
      fixture.detectChanges();

      expect(component.form.get('averagePrice')?.valid).toBe(true);
    });
  });

  describe('variação de quantidade (+N/-N)', () => {
    it('deve aceitar texto no campo de quantidade', () => {
      setup(mxrf);
      patch({ quantity: '+27' });

      const input = element('input#quantity') as HTMLInputElement;

      expect(input.type).toBe('text');
      expect(input.value).toBe('+27');
    });

    it('deve somar +N à quantidade atual e manter o preço médio', () => {
      setup(mxrf);
      patch({ quantity: '+27' });

      component.submit();

      expect(salvos).toEqual([
        {
          ticker: 'MXRF11',
          assetType: 'FII',
          quantity: 59,
          averagePrice: 9.18,
        },
      ]);
    });

    it('deve subtrair -N da quantidade atual sem alterar o preço médio', () => {
      setup(mxrf);
      patch({ quantity: '-10' });

      component.submit();

      expect(salvos[0]).toEqual(
        expect.objectContaining({ quantity: 22, averagePrice: 9.18 }),
      );
    });

    it('deve continuar aceitando o valor total', () => {
      setup(mxrf);
      patch({ quantity: '59' });

      component.submit();

      expect(salvos[0]).toEqual(expect.objectContaining({ quantity: 59 }));
    });

    it('deve exibir o total resultante ao informar variação', () => {
      setup(mxrf);
      patch({ quantity: '+27' });

      expect(
        element('[data-testid="quantity-preview"]')?.textContent,
      ).toContain('Total: 59');
    });

    it('não deve exibir o total ao informar a quantidade cheia', () => {
      setup(mxrf);
      patch({ quantity: '59' });

      expect(element('[data-testid="quantity-preview"]')).toBeNull();
    });

    // O que o template deriva vem do control, não de um espelho mantido à mão
    // (#362): escrever direto no control precisa mover o total e o campo de
    // preço da compra junto.
    it('deve acompanhar escrita feita direto no control', () => {
      setup(mxrf);

      component.form.controls['quantity'].setValue('+27');
      fixture.detectChanges();

      expect(
        element('[data-testid="quantity-preview"]')?.textContent,
      ).toContain('Total: 59');
      expect(element('input#purchasePrice')).not.toBeNull();

      component.form.controls['quantity'].setValue('59');
      fixture.detectChanges();

      expect(element('[data-testid="quantity-preview"]')).toBeNull();
      expect(element('input#purchasePrice')).toBeNull();
    });

    it('deve recusar variação que zere ou negative a quantidade', () => {
      setup(mxrf);
      patch({ quantity: '-32' });

      expect(component.form.get('quantity')?.valid).toBe(false);
    });
  });

  describe('preço da compra', () => {
    it('deve exibir o campo só em compras', () => {
      setup(mxrf);
      expect(element('input#purchasePrice')).toBeNull();

      patch({ quantity: '+27' });
      expect(element('input#purchasePrice')).not.toBeNull();

      patch({ quantity: '-10' });
      expect(element('input#purchasePrice')).toBeNull();
    });

    it('deve recalcular o preço médio ponderado com o preço da compra', () => {
      setup(mxrf);
      patch({ quantity: '+27' });
      patch({ purchasePrice: '10,50' });

      // (32 × 9,18 + 27 × 10,50) / 59 = 9,78
      expect(component.form.get('averagePrice')?.value).toBe('9.78');
    });

    it('deve voltar ao preço médio original ao desfazer a compra', () => {
      setup(mxrf);
      patch({ quantity: '+27' });
      patch({ purchasePrice: '10,50' });
      patch({ quantity: '59' });

      expect(component.form.get('averagePrice')?.value).toBe('9.18');
    });
  });

  describe('fechamento', () => {
    it('deve emitir closed no botão de cancelar', () => {
      setup();

      element('[data-testid="btn-cancelar"]')?.click();

      expect(fechados).toBe(1);
    });
  });
});
