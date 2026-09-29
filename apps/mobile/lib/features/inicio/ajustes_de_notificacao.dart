import 'package:flutter/material.dart';

import '../../core/notificacoes/notificacoes_backend.dart';
import '../../core/notificacoes/notificacoes_service.dart';

/// Liga e desliga as notificações push dentro do app (issue #408).
///
/// Existe para o usuário não precisar ir às configurações do sistema para
/// parar de receber — de lá, ele desligaria e provavelmente não voltaria.
class AjustesDeNotificacao extends StatelessWidget {
  const AjustesDeNotificacao({super.key, required this.notificacoes});

  final NotificacoesService notificacoes;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: notificacoes,
      builder: (context, _) {
        final negadaNoSistema =
            notificacoes.permissao == PermissaoDeNotificacao.negada;

        return SwitchListTile(
          key: const Key('interruptor-notificacoes'),
          value: notificacoes.ativas,
          title: const Text('Notificar preço-alvo'),
          subtitle: Text(
            negadaNoSistema
                // Religar daqui não reabre a folha do sistema: quem negou
                // precisa mudar isso nas configurações do aparelho, e dizer
                // isso é melhor do que um interruptor que não funciona.
                ? 'Permissão negada no aparelho. O aviso continua vindo por '
                      'e-mail.'
                : 'Avisa na hora em que um ativo da geladeira chega ao '
                      'preço-alvo.',
          ),
          onChanged: negadaNoSistema
              ? null
              : (ligar) =>
                    ligar ? notificacoes.ligar() : notificacoes.desligar(),
        );
      },
    );
  }
}
