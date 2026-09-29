import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Lista sem nenhum item.
///
/// Lista vazia e falha de carregamento são estados diferentes e precisam
/// parecer diferentes: tratar os dois como "tela em branco" faz o usuário
/// achar que perdeu dado quando só não cadastrou nada ainda.
class EstadoVazio extends StatelessWidget {
  const EstadoVazio({
    super.key,
    required this.titulo,
    this.descricao,
    this.icone = Icons.inbox_outlined,
    this.rotuloAcao,
    this.aoAgir,
  });

  final String titulo;
  final String? descricao;
  final IconData icone;
  final String? rotuloAcao;
  final VoidCallback? aoAgir;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icone, size: 48, color: t.textMuted),
            const SizedBox(height: 16),
            Text(
              titulo,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(color: t.textPrimary),
            ),
            if (descricao != null) ...[
              const SizedBox(height: 8),
              Text(
                descricao!,
                textAlign: TextAlign.center,
                style: TextStyle(color: t.textSecondary),
              ),
            ],
            if (rotuloAcao != null && aoAgir != null) ...[
              const SizedBox(height: 24),
              FilledButton(onPressed: aoAgir, child: Text(rotuloAcao!)),
            ],
          ],
        ),
      ),
    );
  }
}
