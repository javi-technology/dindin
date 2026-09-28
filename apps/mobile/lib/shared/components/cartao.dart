import 'package:flutter/material.dart';

import '../../core/theme/dindin_tokens.dart';

/// Superfície elevada padrão do app.
///
/// Existe para as telas não reinventarem `Card` com paddings e bordas
/// ligeiramente diferentes em cada lugar — o acúmulo que padronizar depois
/// custa mais do que fazer agora.
class Cartao extends StatelessWidget {
  const Cartao({
    super.key,
    required this.child,
    this.aoTocar,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final VoidCallback? aoTocar;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final forma = BorderRadius.circular(12);

    final conteudo = Padding(padding: padding, child: child);

    return Material(
      color: t.surfaceElevated,
      borderRadius: forma,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: forma,
          border: Border.all(color: t.border),
        ),
        child: aoTocar == null
            ? conteudo
            : InkWell(onTap: aoTocar, borderRadius: forma, child: conteudo),
      ),
    );
  }
}
