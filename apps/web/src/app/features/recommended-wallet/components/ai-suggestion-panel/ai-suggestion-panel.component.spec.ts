import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AiSuggestion } from 'dindin-models';
import {
  AiSuggestionPanelComponent,
  ApplyRequest,
  GenerateRequest,
} from './ai-suggestion-panel.component';

// ---------------------------------------------------------------------------
// Testes do painel de sugestão da IA (issue #310)
//
// Saiu do recommended-wallet.component com o aporte, o paywall e a lista de
// itens com as alternativas de redistribuição (#276). Não fala com a API:
// pede a geração e pede para aplicar; o pai é quem chama o serviço.
// ---------------------------------------------------------------------------

describe('AiSuggestionPanelComponent', () => {
  let fixture: ComponentFixture<AiSuggestionPanelComponent>;
  let component: AiSuggestionPanelComponent;
  let geracoes: GenerateRequest[];
  let aplicacoes: ApplyRequest[];
  let invalidos: string[];

  const suggestion: AiSuggestion = {
    id: 'suggestion-1',
    walletId: 'wallet-1',
    month: '2026-09',
    tab: 'renda',
    model: 'claude-opus-5',
    summary: 'Concentre o aporte em HGLG11.',
    disclaimer: 'Não é recomendação de investimento.',
    createdAt: '2026-09-01T12:00:00Z',
    contribution: 500,
    projectedDividends: 120,
    items: [
      {
        ticker: 'HGLG11',
        action: 'buy',
        priority: 1,
        rationale: 'Desconto sobre o valor patrimonial.',
        suggestedAmount: 400,
        suggestedQuantity: 4,
        referencePrice: 100,
      },
      {
        ticker: 'KNRI11',
        action: 'hold',
        priority: 2,
        rationale: 'Posição já no alvo.',
      },
    ],
  };

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function setup(overrides: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(AiSuggestionPanelComponent);
    component = fixture.componentInstance;
    const inputs: Record<string, unknown> = {
      suggestion: null,
      loading: false,
      error: null,
      hasAiAccess: true,
      showPaywall: false,
      canGenerate: true,
      ...overrides,
    };
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    geracoes = [];
    aplicacoes = [];
    invalidos = [];
    component.generate.subscribe((value) => geracoes.push(value));
    component.apply.subscribe((value) => aplicacoes.push(value));
    component.validationError.subscribe((value) => invalidos.push(value));
    fixture.detectChanges();
  }

  function type(testId: string, value: string): void {
    const input = element(`[data-testid="${testId}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiSuggestionPanelComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  describe('acesso', () => {
    it('deve exibir o paywall sem acesso à IA', () => {
      setup({ hasAiAccess: false, showPaywall: true });

      expect(element('[data-testid="ai-paywall"]')).not.toBeNull();
      expect(element('[data-testid="contribution-input"]')).toBeNull();
    });

    it('deve exibir o aporte e o botão com acesso à IA', () => {
      setup();

      expect(element('[data-testid="ai-paywall"]')).toBeNull();
      expect(element('[data-testid="contribution-input"]')).not.toBeNull();
      expect(
        element('[data-testid="generate-suggestion-button"]'),
      ).not.toBeNull();
    });
  });

  describe('geração', () => {
    it('deve pedir a geração sem aporte quando o campo está vazio', () => {
      setup();

      element('[data-testid="generate-suggestion-button"]')?.click();

      expect(geracoes).toEqual([{ contribution: undefined, force: false }]);
    });

    it('deve enviar o aporte em formato brasileiro', () => {
      setup();
      type('contribution-input', '1.500,50');

      element('[data-testid="generate-suggestion-button"]')?.click();

      expect(geracoes).toEqual([{ contribution: 1500.5, force: false }]);
    });

    it('deve recusar aporte inválido e avisar o pai', () => {
      setup();
      type('contribution-input', 'abc');

      element('[data-testid="generate-suggestion-button"]')?.click();
      fixture.detectChanges();

      // O erro sobe: quem o exibe e o limpa na troca de contexto é o pai.
      expect(geracoes).toEqual([]);
      expect(invalidos).toEqual(['Informe um valor de aporte válido.']);
    });

    it('deve desabilitar o botão sem carteira e mês escolhidos', () => {
      setup({ canGenerate: false });

      expect(
        (
          element(
            '[data-testid="generate-suggestion-button"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBeTrue();
    });

    it('deve pedir regeração forçada', () => {
      setup({ suggestion });

      element('[data-testid="regenerate-suggestion-button"]')?.click();

      expect(geracoes).toEqual([{ contribution: undefined, force: true }]);
    });

    it('deve exibir o erro recebido do pai', () => {
      setup({ error: 'Não foi possível gerar a sugestão.' });

      expect(
        element('[data-testid="suggestion-error"]')?.textContent,
      ).toContain('Não foi possível gerar a sugestão.');
    });
  });

  describe('sugestão', () => {
    it('deve exibir resumo, aporte e proventos projetados', () => {
      setup({ suggestion });

      const card =
        element('[data-testid="suggestion-card"]')?.textContent ?? '';

      expect(card).toContain('Concentre o aporte em HGLG11.');
      expect(card).toMatch(/R\$\s?500,00/);
      expect(card).toMatch(/R\$\s?120,00/);
      // Aporte + proventos = 620,00
      expect(card).toMatch(/R\$\s?620,00/);
    });

    it('deve rotular a ação de cada item', () => {
      setup({ suggestion });

      const card =
        element('[data-testid="suggestion-card"]')?.textContent ?? '';

      expect(card).toContain('Comprar');
      expect(card).toContain('Manter');
    });

    it('deve marcar como aguardar a compra sem valor para uma cota', () => {
      setup({
        suggestion: {
          ...suggestion,
          items: [{ ...suggestion.items[0], suggestedQuantity: 0 }],
        },
      });

      const card =
        element('[data-testid="suggestion-card"]')?.textContent ?? '';

      expect(card).toContain('Aguardar');
      expect(card).toContain('Valor insuficiente para 1 cota');
    });

    it('deve pedir para aplicar a compra do item', () => {
      setup({ suggestion });

      element('[data-testid="apply-item-HGLG11"]')?.click();

      expect(aplicacoes).toEqual([{ item: suggestion.items[0] }]);
    });

    it('deve marcar como aplicado o item já lançado', () => {
      setup({
        suggestion: {
          ...suggestion,
          appliedItems: [{ ticker: 'HGLG11', quantity: 4, price: 100 }],
        },
      });

      const button = element(
        '[data-testid="apply-item-HGLG11"]',
      ) as HTMLButtonElement;

      expect(button.disabled).toBeTrue();
      expect(button.textContent).toContain('Aplicado');
    });
  });

  describe('alternativas de redistribuição', () => {
    const comFallback: AiSuggestion = {
      ...suggestion,
      items: [
        {
          ...suggestion.items[0],
          fallbackAllocations: [
            {
              ticker: 'MXRF11',
              amount: 400,
              suggestedQuantity: 40,
              referencePrice: 10,
            },
          ],
        },
      ],
    };

    it('deve listar as alternativas do item', () => {
      setup({ suggestion: comFallback });

      const bloco =
        element('[data-testid="fallback-allocations"]')?.textContent ?? '';

      expect(bloco).toContain('MXRF11');
      expect(bloco).toMatch(/R\$\s?400,00/);
    });

    it('deve pedir para aplicar a alternativa junto do item de origem', () => {
      setup({ suggestion: comFallback });

      element('[data-testid="apply-fallback-HGLG11-MXRF11"]')?.click();

      expect(aplicacoes).toEqual([
        {
          item: comFallback.items[0],
          alternative: comFallback.items[0].fallbackAllocations?.[0],
        },
      ]);
    });
  });
});
