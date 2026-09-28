import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/acoes_do_item.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_vazio.dart';
import '../../shared/components/visao_recurso.dart';

/// Lista de carteiras do usuário (issue #402).
class CarteirasView extends StatelessWidget {
  const CarteirasView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
    required this.aoAbrir,
    this.aoEditar,
    this.aoExcluir,
  });

  final EstadoDoRecurso<List<Wallet>> estado;
  final VoidCallback aoRecarregar;
  final ValueChanged<Wallet> aoAbrir;

  /// Ausentes quando a tela é só de consulta; a linha então não mostra menu.
  final ValueChanged<Wallet>? aoEditar;
  final Future<void> Function(Wallet)? aoExcluir;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<List<Wallet>>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      estaVazio: (carteiras) => carteiras.isEmpty,
      vazio: (_) => const EstadoVazio(
        titulo: 'Nenhuma carteira',
        descricao: 'Crie uma carteira para registrar suas posições.',
        icone: Icons.account_balance_wallet_outlined,
      ),
      conteudo: (context, carteiras) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: carteiras.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final carteira = carteiras[i];
          final t = context.tokens;

          return Cartao(
            aoTocar: () => aoAbrir(carteira),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        carteira.name,
                        style: TextStyle(
                          color: t.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (carteira.description?.isNotEmpty ?? false) ...[
                        const SizedBox(height: 4),
                        Text(
                          carteira.description!,
                          style: TextStyle(
                            color: t.textSecondary,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (aoEditar != null || aoExcluir != null)
                  AcoesDoItem(
                    aoEditar: aoEditar == null
                        ? null
                        : () => aoEditar!(carteira),
                    aoExcluir: aoExcluir == null
                        ? null
                        : () => aoExcluir!(carteira),
                    tituloDaExclusao: 'Excluir carteira',
                    mensagemDaExclusao:
                        'As posições desta carteira serão excluídas junto. '
                        'Esta ação não pode ser desfeita.',
                  )
                else
                  Icon(Icons.chevron_right, color: t.textMuted),
              ],
            ),
          );
        },
      ),
    );
  }
}
