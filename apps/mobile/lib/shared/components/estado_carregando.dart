import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Carregamento de uma tela inteira.
class EstadoCarregando extends StatelessWidget {
  const EstadoCarregando({super.key, this.mensagem});

  final String? mensagem;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          if (mensagem != null) ...[
            const SizedBox(height: 16),
            Text(mensagem!, style: TextStyle(color: t.textSecondary)),
          ],
        ],
      ),
    );
  }
}
