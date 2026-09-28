import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_vazio.dart';
import '../../shared/components/valor_ausente.dart';
import '../../shared/components/visao_recurso.dart';

/// Itens da geladeira (issue #402).
///
/// O item existe para ser comprado a um preço-alvo, então o que a tela
/// precisa responder num relance é: já chegou no alvo?
class GeladeiraView extends StatelessWidget {
  const GeladeiraView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
  });

  final EstadoDoRecurso<List<FridgeItem>> estado;
  final VoidCallback aoRecarregar;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<List<FridgeItem>>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      estaVazio: (itens) => itens.isEmpty,
      vazio: (_) => const EstadoVazio(
        titulo: 'Nenhum ativo na geladeira',
        descricao:
            'Mova uma posição para cá para acompanhar o preço-alvo de compra.',
        icone: Icons.ac_unit,
      ),
      conteudo: (context, itens) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: itens.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) => _LinhaDoItem(item: itens[i]),
      ),
    );
  }
}

class _LinhaDoItem extends StatelessWidget {
  const _LinhaDoItem({required this.item});

  final FridgeItem item;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final preco = item.currentPrice;
    final atingiu = preco != null && preco <= item.targetPrice;

    return Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.ticker,
                  style: TextStyle(
                    color: t.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              // Sem cotação não dá para dizer se o alvo foi atingido, e
              // comparar com zero diria que sim para todo ativo sem preço.
              if (preco == null)
                ValorAusente(
                  motivo: 'Sem cotação',
                  chave: Key('sem-cotacao-${item.ticker}'),
                )
              else
                Text(
                  Moeda.exibir(preco),
                  style: TextStyle(color: t.textPrimary),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${Moeda.exibirSemSimbolo(item.quantity)} cotas · '
                  'alvo ${Moeda.exibir(item.targetPrice)}',
                  style: TextStyle(color: t.textSecondary, fontSize: 13),
                ),
              ),
              if (atingiu)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: t.positiveSoft,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Alvo atingido',
                    key: Key('alvo-${item.ticker}'),
                    style: TextStyle(
                      color: t.positiveInk,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
