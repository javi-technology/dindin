import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/features/inicio/geladeira_inicial.dart';

// ---------------------------------------------------------------------------
// Geladeira aberta pelo toque na notificação (issue #408).
//
// O `fridgeId` chega no payload justamente para abrir a geladeira do alerta.
// Abrir sempre a primeira acerta a aba e erra o conteúdo: com mais de uma
// geladeira, o usuário toca por causa de um ativo e vê outra lista.
// ---------------------------------------------------------------------------

Fridge geladeira(String id) => Fridge(
  id: id,
  ownerId: 'u1',
  name: 'Geladeira $id',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
);

void main() {
  final geladeiras = [geladeira('g1'), geladeira('g2'), geladeira('g3')];

  test('abre a geladeira indicada pela notificação', () {
    expect(escolherGeladeira(geladeiras, 'g2')?.id, 'g2');
  });

  test('abre a primeira quando a notificação não indica nenhuma', () {
    expect(escolherGeladeira(geladeiras, null)?.id, 'g1');
  });

  // A geladeira pode ter sido excluída entre o alerta e o toque: cair na
  // primeira é melhor que abrir o app numa tela vazia.
  test('abre a primeira quando a indicada não existe mais', () {
    expect(escolherGeladeira(geladeiras, 'sumiu')?.id, 'g1');
  });

  test('não escolhe nada quando não há geladeira', () {
    expect(escolherGeladeira(const [], 'g2'), isNull);
  });
}
