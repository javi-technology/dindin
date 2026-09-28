import 'package:flutter/material.dart';

/// Campo de texto dos formulários, com rótulo e validação.
class CampoTexto extends StatelessWidget {
  const CampoTexto({
    super.key,
    required this.chave,
    required this.rotulo,
    required this.controller,
    this.validador,
    this.dica,
    this.tecladoNumerico = false,
    this.maiusculas = false,
  });

  final String chave;
  final String rotulo;
  final TextEditingController controller;
  final String? Function(String?)? validador;
  final String? dica;
  final bool tecladoNumerico;
  final bool maiusculas;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      key: Key(chave),
      controller: controller,
      decoration: InputDecoration(labelText: rotulo, helperText: dica),
      keyboardType: tecladoNumerico
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      textCapitalization: maiusculas
          ? TextCapitalization.characters
          : TextCapitalization.sentences,
      autocorrect: !maiusculas,
      validator: validador,
    );
  }
}
