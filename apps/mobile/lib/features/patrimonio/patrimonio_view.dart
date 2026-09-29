import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_vazio.dart';
import '../../shared/components/grafico_composicao.dart';
import '../../shared/components/grafico_patrimonio.dart';
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
    this.historico = const [],
  });

  final EstadoDoRecurso<DashboardSummaryResponse> estado;
  final VoidCallback aoRecarregar;

  /// Snapshots para a evolução (#445). Vazio enquanto não chegam, e aí o
  /// gráfico diz o que falta em vez de mostrar uma caixa vazia.
  final List<PatrimonySnapshot> historico;

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
          const SizedBox(height: 24),
          Text('Evolução', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          GraficoPatrimonio(historico: historico),
          const SizedBox(height: 24),
          Text('Composição', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          GraficoComposicao(composicao: resumo.composition),
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
