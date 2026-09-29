import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/format/moeda.dart';

/// Campo de valor monetário no padrão brasileiro (issue #401).
///
/// Aceita vírgula como separador decimal porque é o que o teclado numérico do
/// celular oferece: recusar `1,55` — ou lê-lo como `155` — é erro de dado
/// financeiro, não detalhe de formatação.
class CampoMoeda extends StatefulWidget {
  const CampoMoeda({
    super.key,
    required this.rotulo,
    required this.aoMudar,
    this.valor,
    this.obrigatorio = false,
    this.dica,
  });

  final String rotulo;
  final double? valor;
  final bool obrigatorio;
  final String? dica;

  /// Recebe o número já convertido, ou `null` enquanto o texto não é válido.
  final ValueChanged<double?> aoMudar;

  @override
  State<CampoMoeda> createState() => _CampoMoedaState();
}

class _CampoMoedaState extends State<CampoMoeda> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.valor == null ? '' : Moeda.exibirSemSimbolo(widget.valor!),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String? _validar(String? texto) {
    final vazio = (texto ?? '').trim().isEmpty;

    if (vazio) return widget.obrigatorio ? 'Informe o valor.' : null;
    if (Moeda.interpretar(texto) == null) return 'Valor inválido.';

    return null;
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: _controller,
      decoration: InputDecoration(
        labelText: widget.rotulo,
        helperText: widget.dica,
        prefixText: r'R$ ',
      ),
      // `signed: false` some com o menos, que num preço só atrapalha; o
      // teclado decimal do Android traz a vírgula, o do iOS traz o ponto, e
      // o parser aceita os dois.
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.,]'))],
      validator: _validar,
      onChanged: (texto) => widget.aoMudar(Moeda.interpretar(texto)),
    );
  }
}
