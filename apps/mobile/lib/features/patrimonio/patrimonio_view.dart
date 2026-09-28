import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_vazio.dart';
import '../../shared/components/visao_recurso.dart';

/// Resumo do patrimônio (issue #402).
///
/// É a primeira tela e a razão de abrir o app: o total, a divisão entre
/// carteira e geladeira, a renda projetada e a composição.
class PatrimonioView extends StatelessWidget {
  const PatrimonioView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
  });

  final EstadoDoRecurso<DashboardSummaryResponse> estado;
  final VoidCallback aoRecarregar;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<DashboardSummaryResponse>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      estaVazio: (resumo) => resumo.total == 0 && resumo.composition.isEmpty,
      vazio: (_) => const EstadoVazio(
        titulo: 'Nenhuma posição ainda',
        descricao:
            'Cadastre uma posição na carteira para acompanhar seu patrimônio.',
        icone: Icons.account_balance_wallet_outlined,
      ),
      conteudo: (context, resumo) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _Total(resumo: resumo),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _Numero(
                  rotulo: 'Na carteira',
                  valor: resumo.totalWallet,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Numero(
                  rotulo: 'Na geladeira',
                  valor: resumo.totalFridge,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _Numero(
            rotulo: 'Renda mensal projetada',
            valor: resumo.monthlyIncomeTotal,
          ),
          if (resumo.composition.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text('Composição', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            // A API já devolve em ordem decrescente de valor e com a
            // geladeira contada uma única vez; reordenar aqui reaplicaria
            // regra de negócio no cliente, que foi o que a #300 tirou da web.
            ...resumo.composition.map(
              (item) => _LinhaDaComposicao(item: item, total: resumo.total),
            ),
          ],
        ],
      ),
    );
  }
}

class _Total extends StatelessWidget {
  const _Total({required this.resumo});

  final DashboardSummaryResponse resumo;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Patrimônio total', style: TextStyle(color: t.textSecondary)),
          const SizedBox(height: 4),
          Text(
            Moeda.exibir(resumo.total),
            key: const Key('total-patrimonio'),
            style: Theme.of(context).textTheme.headlineMedium
                ?.copyWith(color: t.textPrimary, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _Numero extends StatelessWidget {
  const _Numero({required this.rotulo, required this.valor});

  final String rotulo;
  final double valor;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(rotulo, style: TextStyle(color: t.textSecondary, fontSize: 13)),
          const SizedBox(height: 4),
          Text(
            Moeda.exibir(valor),
            style: TextStyle(
              color: t.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _LinhaDaComposicao extends StatelessWidget {
  const _LinhaDaComposicao({required this.item, required this.total});

  final TickerValue item;
  final double total;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final fatia = total == 0 ? 0.0 : item.value / total;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(item.ticker, style: TextStyle(color: t.textPrimary)),
          ),
          Text(
            Moeda.percentual(fatia),
            style: TextStyle(color: t.textMuted, fontSize: 13),
          ),
          const SizedBox(width: 12),
          Text(
            Moeda.exibir(item.value),
            style: TextStyle(color: t.textSecondary),
          ),
        ],
      ),
    );
  }
}
