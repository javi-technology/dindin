import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/format/data.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_vazio.dart';
import '../../shared/components/valor_ausente.dart';
import '../../shared/components/visao_recurso.dart';

/// Renda mensal projetada (issue #402).
///
/// A projeção parte do **último provento real** e assume que ele se repete.
/// A premissa fica visível na tela: não vale para pagador trimestral nem para
/// FII de provento variável, e omiti-la faria o número parecer uma promessa.
class ProjecaoView extends StatelessWidget {
  const ProjecaoView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
  });

  final EstadoDoRecurso<MonthlyIncomeResponse> estado;
  final VoidCallback aoRecarregar;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<MonthlyIncomeResponse>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      estaVazio: (projecao) => projecao.byTicker.isEmpty && projecao.total == 0,
      vazio: (_) => const EstadoVazio(
        titulo: 'Nenhuma renda projetada',
        descricao:
            'Cadastre posições para ver a renda mensal projetada por ativo.',
        icone: Icons.trending_up,
      ),
      conteudo: (context, projecao) {
        final t = context.tokens;

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Cartao(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Renda mensal projetada',
                    style: TextStyle(color: t.textSecondary),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    Moeda.exibir(projecao.total),
                    key: const Key('total-projetado'),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: t.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
              child: Text(
                'Projeção a partir do último provento real informado, '
                'assumindo que ele se repete. Não é promessa de '
                'rentabilidade.',
                key: const Key('premissa-projecao'),
                style: TextStyle(color: t.textMuted, fontSize: 12),
              ),
            ),
            ...projecao.byTicker.map(_LinhaProjetada.new),
          ],
        );
      },
    );
  }
}

class _LinhaProjetada extends StatelessWidget {
  const _LinhaProjetada(this.item);

  final MonthlyIncomeItem item;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    // Provento zero aqui quer dizer "não sabemos", não "não paga": exibir
    // R$ 0,00 faria o usuário concluir que o ativo não rende nada.
    final semProvento = item.monthlyDividend == 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.ticker, style: TextStyle(color: t.textPrimary)),
                if (item.paymentDate != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Pagamento em ${Data.diaMesAno(item.paymentDate!)}',
                    style: TextStyle(color: t.textMuted, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
          if (semProvento)
            ValorAusente(
              motivo: 'Sem provento conhecido',
              chave: Key('sem-provento-${item.ticker}'),
            )
          else
            Text(
              Moeda.exibir(item.monthlyIncome),
              style: TextStyle(
                color: t.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
    );
  }
}
