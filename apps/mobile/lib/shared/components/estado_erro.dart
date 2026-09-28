import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Falha ao carregar uma tela.
///
/// Sempre com caminho de recuperação quando existe um: no celular a conexão
/// cai no elevador e no metrô, e uma tela de erro sem "tentar de novo" deixa
/// o usuário preso até fechar o app.
class EstadoErro extends StatelessWidget {
  const EstadoErro({super.key, required this.mensagem, this.aoTentarDeNovo});

  final String mensagem;
  final VoidCallback? aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: t.danger),
            const SizedBox(height: 16),
            Text(
              mensagem,
              key: const Key('mensagem-erro'),
              textAlign: TextAlign.center,
              style: TextStyle(color: t.textPrimary),
            ),
            if (aoTentarDeNovo != null) ...[
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: aoTentarDeNovo,
                icon: const Icon(Icons.refresh),
                label: const Text('Tentar de novo'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
