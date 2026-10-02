import 'package:flutter/material.dart';

import '../../core/api/atualizacao_obrigatoria.dart';
import '../../core/theme/dindin_tokens.dart';

/// Troca o app pela tela de atualização quando a API recusa a versão
/// instalada (issue #500).
class AtualizacaoGate extends StatelessWidget {
  const AtualizacaoGate({
    super.key,
    required this.atualizacao,
    required this.child,
  });

  final AtualizacaoObrigatoria atualizacao;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: atualizacao,
      builder: (context, _) =>
          atualizacao.exigida ? const _TelaAtualizacao() : child,
    );
  }
}

class _TelaAtualizacao extends StatelessWidget {
  const _TelaAtualizacao();

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.system_update, size: 56, color: t.action),
                const SizedBox(height: 24),
                Text(
                  'Atualize o DinDin',
                  key: const Key('titulo-atualizacao'),
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Text(
                  'Esta versão do app não é mais aceita. Instale a versão '
                  'mais recente pela App Store ou Google Play para continuar.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: t.textPrimary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
