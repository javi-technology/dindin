import 'package:flutter/material.dart';

import '../../core/assinatura/loja_service.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';

/// Abre os planos numa folha de baixo, como os formulários do app: com o
/// teclado ou o gesto da loja por cima, um diálogo centralizado some.
Future<void> abrirPlanosDaLoja(BuildContext context, LojaService loja) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SafeArea(child: PlanosDaLoja(loja: loja)),
    );

/// Planos da assinatura vendidos pela loja (issue #405).
///
/// Preço e título vêm da loja: mostrar outro valor contradiria a cobrança
/// que ela vai fazer. As lojas também exigem que a renovação automática e o
/// caminho de cancelamento estejam à vista antes da compra.
class PlanosDaLoja extends StatelessWidget {
  const PlanosDaLoja({super.key, required this.loja});

  final LojaService loja;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: loja,
      builder: (context, _) {
        final t = context.tokens;

        if (!loja.disponivel) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'A compra pela loja não está disponível neste aparelho. '
              'Você pode assinar pelo site do DinDin e usar o mesmo acesso '
              'aqui no app.',
            ),
          );
        }

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Assine o DinDin',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              for (final plano in loja.produtos) ...[
                Cartao(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              plano.titulo,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              plano.preco,
                              style: TextStyle(color: t.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      FilledButton(
                        key: Key('assinar-${plano.id}'),
                        // O tema estica o botão na largura toda; numa Row
                        // isso dá restrição infinita.
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(96, 44),
                        ),
                        onPressed: loja.processando
                            ? null
                            : () => loja.comprar(plano.id),
                        child: const Text('Assinar'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (loja.erro != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    loja.erro!,
                    key: const Key('erro-loja'),
                    style: TextStyle(color: t.danger),
                  ),
                ),
              TextButton(
                key: const Key('restaurar-compras'),
                onPressed: loja.processando ? null : loja.restaurar,
                child: const Text('Restaurar compras'),
              ),
              const SizedBox(height: 8),
              Text(
                'A assinatura renova automaticamente e é cobrada pela loja do '
                'seu aparelho. Para cancelar, cancele nas configurações da '
                'sua conta na loja, ao menos 24 horas antes da renovação.',
                style: TextStyle(fontSize: 12, color: t.textMuted),
              ),
            ],
          ),
        );
      },
    );
  }
}
