import 'package:flutter/material.dart';

/// O estado de envio de um formulário (issue #403).
///
/// Fica num mixin porque os quatro formulários precisam da mesma proteção, e
/// a que faltar é a que vai duplicar um registro: no celular, tocar de novo
/// quando a resposta demora é o comportamento normal do usuário.
mixin EnvioDeFormulario<T extends StatefulWidget> on State<T> {
  bool _enviando = false;

  bool get enviando => _enviando;

  /// Valida, envia e mantém o botão indisponível até a resposta chegar.
  ///
  /// Uma segunda chamada enquanto a primeira não respondeu é descartada — é
  /// o que impede o toque duplo de virar dois registros.
  Future<void> enviar(
    GlobalKey<FormState> formulario,
    Future<bool> Function() acao,
  ) async {
    if (_enviando) return;
    if (!formulario.currentState!.validate()) return;

    setState(() => _enviando = true);

    try {
      await acao();
    } finally {
      // Volta a ficar disponível mesmo na falha: o formulário segue
      // preenchido e o usuário tenta de novo sem redigitar tudo.
      if (mounted) setState(() => _enviando = false);
    }
  }
}
