import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Mensagem de erro e botão de salvar dos formulários (issue #403).
///
/// O rodapé pertence ao formulário, e não ao modal que o projeta, porque só
/// ele sabe quando o envio é válido — a mesma divisão que a web adotou.
class RodapeFormulario extends StatelessWidget {
  const RodapeFormulario({
    super.key,
    required this.enviando,
    required this.aoSalvar,
    this.erro,
    this.rotulo = 'Salvar',
  });

  final bool enviando;
  final VoidCallback aoSalvar;
  final String? erro;
  final String rotulo;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (erro != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: t.dangerSoft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              erro!,
              key: const Key('erro-formulario'),
              style: TextStyle(color: t.dangerInk),
            ),
          ),
          const SizedBox(height: 16),
        ],
        FilledButton(
          key: const Key('botao-salvar'),
          // Indisponível durante o envio: é a metade visível da proteção
          // contra o toque duplo, e a que o usuário entende.
          onPressed: enviando ? null : aoSalvar,
          child: Text(enviando ? 'Salvando…' : rotulo),
        ),
      ],
    );
  }
}
