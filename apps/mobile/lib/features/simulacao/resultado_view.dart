import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/selo_assinante.dart';
import '../../shared/components/valor_ausente.dart';

/// Resultado da simulação geral (issue #404).
///
/// Renda projetada, detalhe por ativo, cotas compradas e troco não alocado —
/// com a premissa visível, para o número não parecer promessa.
class ResultadoView extends StatelessWidget {
  const ResultadoView({
    super.key,
    required this.resultado,
    required this.aoSimularAtivo,
  });

  final WalletSimulationResponse resultado;

  /// Ponto de entrada da simulação por ativo, marcado como recurso de
  /// assinante. Nulo enquanto a liberação não existir (issue #405).
  final ValueChanged<SimulationItem>? aoSimularAtivo;

  @override
  Widget build(BuildContext context) {
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
                Moeda.exibir(resultado.monthlyIncome),
                key: const Key('renda-projetada'),
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: t.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              _Linha(
                rotulo: 'Total no período (${resultado.months} meses)',
                valor: Moeda.exibir(resultado.totalIncome),
              ),
              _Linha(
                rotulo: 'Investido',
                valor: Moeda.exibir(resultado.allocatedAmount),
              ),
              // O troco não rende, e escondê-lo faria a conta do usuário não
              // fechar: ele somaria o investido e não chegaria ao aporte.
              if (resultado.unallocatedAmount > 0)
                _Linha(
                  chave: const Key('troco'),
                  rotulo: 'Troco (não comprou cota inteira)',
                  valor: Moeda.exibir(resultado.unallocatedAmount),
                ),
              if (resultado.mode == SimulationMode.reinvest &&
                  resultado.reinvestedAmount > 0)
                _Linha(
                  rotulo: 'Reinvestido',
                  valor: Moeda.exibir(resultado.reinvestedAmount),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text(
            'Projeção a partir do último provento real de cada ativo, '
            'assumindo que ele se repete nos ${resultado.months} meses. '
            'Não é promessa de rentabilidade.',
            key: const Key('premissa-simulacao'),
            style: TextStyle(color: t.textMuted, fontSize: 12),
          ),
        ),
        const SizedBox(height: 8),
        Text('Por ativo', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ...resultado.byTicker.map(
          (item) => _LinhaDoAtivo(item: item, aoSimularAtivo: aoSimularAtivo),
        ),
      ],
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.rotulo, required this.valor, this.chave});

  final String rotulo;
  final String valor;
  final Key? chave;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Padding(
      key: chave,
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              rotulo,
              style: TextStyle(color: t.textSecondary, fontSize: 13),
            ),
          ),
          Text(valor, style: TextStyle(color: t.textPrimary, fontSize: 13)),
        ],
      ),
    );
  }
}

class _LinhaDoAtivo extends StatelessWidget {
  const _LinhaDoAtivo({required this.item, this.aoSimularAtivo});

  final SimulationItem item;
  final ValueChanged<SimulationItem>? aoSimularAtivo;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final semProvento = item.missingDividend == true;

    return Cartao(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
              // Renda zero aqui quer dizer "não sabemos", não "não paga":
              // exibir R$ 0,00 faria o usuário descartar o ativo.
              if (semProvento)
                ValorAusente(
                  motivo: 'Sem provento conhecido',
                  chave: Key('sem-provento-${item.ticker}'),
                )
              else
                Text(
                  Moeda.exibir(item.monthlyIncome),
                  style: TextStyle(
                    color: t.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${Moeda.exibirSemSimbolo(item.quantity)} cotas · '
                  '${Moeda.exibir(item.price)}',
                  style: TextStyle(color: t.textSecondary, fontSize: 13),
                ),
              ),
              if (aoSimularAtivo != null) ...[
                const SeloAssinante(),
                const SizedBox(width: 4),
                IconButton(
                  key: Key('simular-ativo-${item.ticker}'),
                  onPressed: () => aoSimularAtivo!(item),
                  icon: const Icon(Icons.insights_outlined, size: 20),
                  tooltip: 'Simular só este ativo',
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
