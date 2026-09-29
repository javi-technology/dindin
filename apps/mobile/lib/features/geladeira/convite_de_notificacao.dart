import 'package:flutter/material.dart';

import '../../core/notificacoes/notificacoes_backend.dart';
import '../../core/notificacoes/notificacoes_service.dart';
import '../../core/theme/dindin_tokens.dart';

/// Convite para ligar as notificações do alerta de preço-alvo (issue #408).
///
/// Aparece **na geladeira**, que é onde o alerta acontece, e explica para que
/// serve antes de a folha do sistema abrir: pedir na primeira abertura, sem
/// contexto, é o jeito mais rápido de receber um "não" definitivo — a
/// permissão só pode ser pedida uma vez.
///
/// Some depois de o usuário decidir, nos dois sentidos: quem negou continua
/// recebendo o alerta por e-mail e não precisa ser lembrado disso.
class ConviteDeNotificacao extends StatelessWidget {
  const ConviteDeNotificacao({super.key, required this.notificacoes});

  final NotificacoesService notificacoes;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: notificacoes,
      builder: (context, _) {
        if (notificacoes.jaPerguntou ||
            notificacoes.permissao != PermissaoDeNotificacao.naoPerguntada) {
          return const SizedBox.shrink();
        }

        final t = context.tokens;

        return Container(
          key: const Key('convite-notificacao'),
          margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: t.infoSoft,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.notifications_active_outlined,
                    size: 18,
                    color: t.infoInk,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Avisar quando o preço-alvo for atingido',
                      style: TextStyle(
                        color: t.infoInk,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Com a notificação, o aviso chega na hora em que o ativo '
                'chega ao seu preço. Sem ela, ele continua vindo por e-mail.',
                style: TextStyle(color: t.infoInk, fontSize: 13),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  key: const Key('ligar-notificacoes'),
                  onPressed: notificacoes.pedirPermissao,
                  child: const Text('Ativar notificações'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
