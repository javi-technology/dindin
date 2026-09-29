import '../../contracts/contracts.g.dart';

/// Geladeira a abrir na entrada do app (issue #408).
///
/// O `fridgeId` chega no payload da notificação justamente para levar o
/// usuário à geladeira do alerta. Abrir sempre a primeira acertava a aba e
/// errava o conteúdo: com mais de uma geladeira, quem tocou por causa de um
/// ativo via outra lista.
///
/// Sem indicação — ou quando a geladeira indicada não existe mais, o que
/// acontece se ela foi excluída entre o alerta e o toque — vale a primeira,
/// que é o caso comum de quem tem uma só.
Fridge? escolherGeladeira(List<Fridge> geladeiras, String? indicada) {
  if (geladeiras.isEmpty) return null;

  for (final geladeira in geladeiras) {
    if (geladeira.id == indicada) return geladeira;
  }

  return geladeiras.first;
}
