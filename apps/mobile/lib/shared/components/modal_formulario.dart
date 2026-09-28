import 'package:flutter/material.dart';

/// Folha modal que projeta um formulário (issue #403).
///
/// Folha de baixo e não diálogo: com o teclado aberto, um diálogo centralizado
/// some atrás dele no celular. O rodapé com o botão pertence ao formulário
/// projetado, porque só ele sabe quando o envio é válido — a mesma divisão
/// que a web adotou no `app-modal`.
abstract final class ModalFormulario {
  static Future<T?> mostrar<T>(
    BuildContext context, {
    required String titulo,
    required Widget Function(BuildContext) formulario,
  }) => showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => Padding(
      // Sobe o conteúdo junto com o teclado: sem isso, o campo em foco fica
      // escondido e o usuário digita às cegas.
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    titulo,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  key: const Key('botao-fechar-modal'),
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                  tooltip: 'Fechar',
                ),
              ],
            ),
            const SizedBox(height: 16),
            formulario(context),
          ],
        ),
      ),
    ),
  );
}
