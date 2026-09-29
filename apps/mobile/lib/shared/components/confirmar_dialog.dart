import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Confirmação de ação destrutiva (issue #401).
///
/// Componente do app, **nunca** diálogo nativo do sistema: o nativo não
/// acompanha a paleta, não dá para nomear o botão com o verbo da ação e
/// apresenta "OK/Cancelar" com o mesmo peso visual — em ação que apaga dado
/// financeiro, o destrutivo não pode parecer a opção padrão.
///
/// O `AlertDialog` do Material já traz o que a web resolveu à mão na
/// `confirm-dialog`: papel de diálogo para leitores de tela, fechamento por
/// gesto de voltar, foco preso enquanto aberto e devolvido ao gatilho.
class ConfirmarDialog extends StatelessWidget {
  const ConfirmarDialog({
    super.key,
    required this.titulo,
    required this.mensagem,
    this.rotuloConfirmar = 'Confirmar',
    this.rotuloCancelar = 'Cancelar',
  });

  final String titulo;
  final String mensagem;
  final String rotuloConfirmar;
  final String rotuloCancelar;

  /// Abre o diálogo e devolve `true` na confirmação.
  ///
  /// Fechar por fora devolve `false`, não `null`: quem chama trata um caso
  /// só, e "não confirmou" é a leitura certa para qualquer saída que não
  /// seja o botão de confirmar.
  static Future<bool> mostrar(
    BuildContext context, {
    required String titulo,
    required String mensagem,
    String rotuloConfirmar = 'Confirmar',
    String rotuloCancelar = 'Cancelar',
  }) async {
    final confirmou = await showDialog<bool>(
      context: context,
      builder: (_) => ConfirmarDialog(
        titulo: titulo,
        mensagem: mensagem,
        rotuloConfirmar: rotuloConfirmar,
        rotuloCancelar: rotuloCancelar,
      ),
    );

    return confirmou ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AlertDialog(
      title: Text(titulo, style: TextStyle(color: t.textPrimary)),
      content: Text(mensagem, style: TextStyle(color: t.textSecondary)),
      actions: [
        TextButton(
          key: const Key('botao-cancelar'),
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(rotuloCancelar),
        ),
        FilledButton(
          key: const Key('botao-confirmar'),
          style: FilledButton.styleFrom(
            backgroundColor: t.danger,
            foregroundColor: t.onDanger,
          ),
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(rotuloConfirmar),
        ),
      ],
    );
  }
}
