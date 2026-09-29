import 'package:flutter/material.dart';

import 'confirmar_dialog.dart';

/// Menu de editar e excluir de uma linha de lista (issue #403).
///
/// A exclusão **sempre** passa pela confirmação do app: apagar posição é
/// apagar dado financeiro, e o diálogo nativo do sistema dá o mesmo peso
/// visual ao "OK" e ao "Cancelar".
class AcoesDoItem extends StatelessWidget {
  const AcoesDoItem({
    super.key,
    this.aoEditar,
    this.aoExcluir,
    required this.tituloDaExclusao,
    required this.mensagemDaExclusao,
  });

  final VoidCallback? aoEditar;
  final Future<void> Function()? aoExcluir;
  final String tituloDaExclusao;
  final String mensagemDaExclusao;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      key: const Key('acoes-do-item'),
      icon: const Icon(Icons.more_vert),
      tooltip: 'Ações',
      onSelected: (acao) async {
        if (acao == 'editar') {
          aoEditar?.call();
          return;
        }

        final confirmou = await ConfirmarDialog.mostrar(
          context,
          titulo: tituloDaExclusao,
          mensagem: mensagemDaExclusao,
          rotuloConfirmar: 'Excluir',
        );

        if (confirmou) await aoExcluir?.call();
      },
      itemBuilder: (_) => [
        if (aoEditar != null)
          const PopupMenuItem(value: 'editar', child: Text('Editar')),
        if (aoExcluir != null)
          const PopupMenuItem(value: 'excluir', child: Text('Excluir')),
      ],
    );
  }
}
