import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/theme/dindin_tokens.dart';
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
  });

  final EstadoDoRecurso<List<Wallet>> estado;
  final VoidCallback aoRecarregar;
  final ValueChanged<Wallet> aoAbrir;

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
                Icon(Icons.chevron_right, color: t.textMuted),
              ],
            ),
          );
        },
      ),
    );
  }
}
