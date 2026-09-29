import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Marca de recurso pago (issue #404).
///
/// O ponto de entrada da simulação por ativo existe desde já, marcado: a
/// liberação depende de compra in-app, que é a issue #405. Esconder o recurso
/// até lá faria o assinante da web não encontrá-lo no app.
class SeloAssinante extends StatelessWidget {
  const SeloAssinante({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      key: const Key('selo-assinante'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: t.brandSoft,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.lock_outline, size: 12, color: t.brandInk),
          const SizedBox(width: 4),
          Text(
            'Assinante',
            style: TextStyle(
              color: t.brandInk,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
