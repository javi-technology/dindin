import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/features/inicio/geladeira_inicial.dart';

// ---------------------------------------------------------------------------
// Gestão da geladeira — achados do review da #449.
//
// Trocar de geladeira mudava só o que a tela mostrava: criar um ativo em
// seguida gravava na primeira da lista, e não na que estava aberta. Excluir a
// última deixava o app sem forma de criar outra. E renomear não chegava ao
// cabeçalho, porque a aba observa os itens, não a lista de geladeiras.
// ---------------------------------------------------------------------------

Fridge geladeira(String id, {String? descricao}) => Fridge(
  id: id,
  ownerId: 'u1',
  name: 'Geladeira $id',
  description: descricao,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
);

void main() {
  final geladeiras = [geladeira('g1'), geladeira('g2')];

  group('geladeira de destino', () {
    // O id vem da geladeira aberta, e não da primeira da lista: era o que
    // fazia o ativo cair na geladeira errada depois de trocar.
    test('usa a aberta, não a primeira', () {
      expect(escolherGeladeira(geladeiras, 'g2')?.id, 'g2');
    });

    test('cai na primeira quando nenhuma está aberta', () {
      expect(escolherGeladeira(geladeiras, null)?.id, 'g1');
    });

    test('não escolhe nada sem geladeira', () {
      expect(escolherGeladeira(const [], 'g2'), isNull);
    });
  });

  group('descrição', () {
    // `toJson` omite o nulo, então o backend mantinha o texto anterior:
    // limpar o campo não apagava nada. String vazia é o pedido explícito.
    test('vazia vira string vazia, não nulo', () {
      const pedido = UpdateFridgeRequest(name: 'Nome', description: '');

      expect(pedido.toJson()['description'], '');
    });

    test('preenchida segue como está', () {
      const pedido = UpdateFridgeRequest(name: 'Nome', description: 'Texto');

      expect(pedido.toJson()['description'], 'Texto');
    });
  });
}
