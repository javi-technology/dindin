import 'package:flutter/material.dart';

import '../../core/api/aviso_de_limite.dart';
import '../../core/theme/dindin_tokens.dart';

/// Mostra o aviso de rate limit (issue #505) por cima de qualquer tela, sem
/// tirá-la: o usuário continua vendo o que estava lendo e sabe quanto esperar.
class AvisoDeLimiteGate extends StatelessWidget {
  const AvisoDeLimiteGate({
    super.key,
    required this.aviso,
    required this.child,
  });

  final AvisoDeLimite aviso;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: aviso,
      builder: (context, _) {
        final segundos = aviso.segundos;
        if (segundos == null) return child;

        final t = context.tokens;
        return Column(
          children: [
            Material(
              color: t.warningSoft,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Row(
                    key: const Key('aviso-de-limite'),
                    children: [
                      Expanded(
                        child: Text(
                          mensagemDeLimite(segundos),
                          style: TextStyle(color: t.warningInk),
                        ),
                      ),
                      // Sem `tooltip`: este aviso fica acima do Navigator, onde
                      // não há Overlay para exibi-lo.
                      Semantics(
                        label: 'Fechar',
                        button: true,
                        excludeSemantics: true,
                        child: IconButton(
                          key: const Key('aviso-de-limite-fechar'),
                          icon: Icon(Icons.close, color: t.warningInk),
                          onPressed: aviso.dispensar,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(child: child),
          ],
        );
      },
    );
  }
}
