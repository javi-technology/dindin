import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/theme/dindin_tokens.dart';

/// Cabeçalho da geladeira: qual está aberta e o que fazer com ela (#444).
///
/// Antes o app abria a primeira geladeira e não havia como chegar às outras,
/// nem criar, renomear ou excluir — isso só existia no site. As ações ficam
/// junto do nome porque é onde o usuário procura por elas.
class SeletorDeGeladeira extends StatelessWidget {
  const SeletorDeGeladeira({
    super.key,
    required this.geladeiras,
    required this.aberta,
    required this.aoTrocar,
    required this.aoCriar,
    required this.aoRenomear,
    required this.aoExcluir,
  });

  final List<Fridge> geladeiras;
  final Fridge aberta;
  final ValueChanged<Fridge> aoTrocar;
  final VoidCallback aoCriar;
  final VoidCallback aoRenomear;
  final VoidCallback aoExcluir;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 4, 0),
      child: Row(
        children: [
          Expanded(
            child: Text(
              aberta.name,
              style: Theme.of(context).textTheme.titleMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          // Com uma geladeira só, o seletor seria um menu de um item — ruído
          // numa tela de celular.
          if (geladeiras.length > 1)
            PopupMenuButton<Fridge>(
              key: const Key('trocar-geladeira'),
              tooltip: 'Trocar de geladeira',
              icon: Icon(Icons.swap_horiz, color: t.textSecondary),
              onSelected: aoTrocar,
              itemBuilder: (context) => [
                for (final geladeira in geladeiras)
                  PopupMenuItem(value: geladeira, child: Text(geladeira.name)),
              ],
            ),
          PopupMenuButton<VoidCallback>(
            key: const Key('acoes-geladeira'),
            tooltip: 'Ações da geladeira',
            icon: Icon(Icons.more_vert, color: t.textSecondary),
            onSelected: (acao) => acao(),
            itemBuilder: (context) => [
              PopupMenuItem(
                value: aoCriar,
                child: const Text('Nova geladeira'),
              ),
              PopupMenuItem(value: aoRenomear, child: const Text('Renomear')),
              PopupMenuItem(
                value: aoExcluir,
                child: Text('Excluir', style: TextStyle(color: t.danger)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
