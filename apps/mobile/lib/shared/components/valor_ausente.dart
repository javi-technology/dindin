import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Marca de "não sabemos", onde um número apareceria (issue #402).
///
/// Ativo sem cotação ou sem provento conhecido **nunca** aparece como zero:
/// num app financeiro zero é um número, e o usuário o lê como um — concluiria
/// que o ativo não vale nada ou não paga nada, quando o app é que não sabe.
class ValorAusente extends StatelessWidget {
  const ValorAusente({super.key, required this.motivo, this.chave});

  final String motivo;

  /// Chave do widget, para a tela poder apontá-la nos testes.
  final Key? chave;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Row(
      key: chave,
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.help_outline, size: 14, color: t.warningInk),
        const SizedBox(width: 4),
        Text(motivo, style: TextStyle(color: t.warningInk, fontSize: 12)),
      ],
    );
  }
}
