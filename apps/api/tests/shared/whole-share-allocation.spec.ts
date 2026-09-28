import { buyWholeSharesWithRemainder } from '../../src/shared/whole-share-allocation';

describe('whole-share-allocation', () => {
  it('deve devolver o troco intacto quando nenhuma cota cabe', () => {
    const candidates = [{ price: 50, priority: 0, quantity: 0 }];

    expect(buyWholeSharesWithRemainder(candidates, 30)).toBe(30);
    expect(candidates[0].quantity).toBe(0);
  });

  it('deve comprar cotas inteiras até o troco acabar', () => {
    const candidates = [{ price: 10, priority: 0, quantity: 1 }];

    expect(buyWholeSharesWithRemainder(candidates, 35)).toBe(5);
    expect(candidates[0].quantity).toBe(4);
  });

  it('deve atender primeiro quem ainda não tem nenhuma cota', () => {
    const candidates = [
      { price: 10, priority: 0, quantity: 2 },
      { price: 10, priority: 1, quantity: 0 },
    ];

    expect(buyWholeSharesWithRemainder(candidates, 10)).toBe(0);
    expect(candidates.map((candidate) => candidate.quantity)).toEqual([2, 1]);
  });

  it('deve usar a prioridade como desempate entre candidatos equivalentes', () => {
    const candidates = [
      { price: 10, priority: 5, quantity: 0 },
      { price: 10, priority: 1, quantity: 0 },
    ];

    buyWholeSharesWithRemainder(candidates, 10);

    expect(candidates.map((candidate) => candidate.quantity)).toEqual([0, 1]);
  });

  it('deve ignorar candidato sem preço utilizável', () => {
    const candidates = [
      { price: 0, priority: 0, quantity: 0 },
      { price: 10, priority: 1, quantity: 0 },
    ];

    expect(buyWholeSharesWithRemainder(candidates, 10)).toBe(0);
    expect(candidates.map((candidate) => candidate.quantity)).toEqual([0, 1]);
  });

  it('não deve acumular resíduo de ponto flutuante no troco', () => {
    const candidates = [{ price: 0.1, priority: 0, quantity: 0 }];

    expect(buyWholeSharesWithRemainder(candidates, 0.3)).toBe(0);
    expect(candidates[0].quantity).toBe(3);
  });
});
