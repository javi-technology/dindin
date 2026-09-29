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

/// Comparação entre a carteira do usuário e a sugerida (issue #404).
///
/// É a tela mais densa do produto. Na web ela é uma tabela; no celular, uma
/// tabela de quatro colunas viraria rolagem horizontal — que esconde
/// justamente a coluna da comparação. Aqui cada ativo é um cartão, com os
/// dois pesos empilhados e uma barra que mostra a diferença sem número.
class ComparacaoView extends StatelessWidget {
  const ComparacaoView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
    this.rodape,
  });

  final EstadoDoRecurso<RecommendedWalletComparison> estado;
  final VoidCallback aoRecarregar;

  /// O que vem depois da comparação — hoje, as sugestões da IA (#446).
  ///
  /// Entra na mesma lista, e não numa área rolável própria: duas viewports
  /// empilhadas disputariam o gesto de rolar.
  final Widget? rodape;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<RecommendedWalletComparison>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      estaVazio: (comparacao) => comparacao.items.isEmpty,
      vazio: (_) => const EstadoVazio(
        titulo: 'Nada a comparar',
        descricao:
            'Cadastre posições na carteira para compará-la com a sugerida.',
        icone: Icons.compare_arrows,
      ),
      conteudo: (context, comparacao) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Carteira sugerida de ${Data.mesAno(comparacao.recommended.month)}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          ...comparacao.items.map(_LinhaDaComparacao.new),
          if (rodape != null) ...[const SizedBox(height: 24), rodape!],
        ],
      ),
    );
  }
}

class _LinhaDaComparacao extends StatelessWidget {
  const _LinhaDaComparacao(this.item);

  final RecommendedWalletComparisonItem item;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final ausente = item.currentWeight == null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Cartao(
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
                // Peso ausente quer dizer "não está na carteira", e zero
                // diria "está, com peso nenhum" — são situações diferentes.
                if (ausente)
                  ValorAusente(
                    motivo: 'Não está na carteira',
                    chave: Key('ausente-${item.ticker}'),
                  )
                else
                  Text(
                    Moeda.exibir(item.currentValue),
                    style: TextStyle(color: t.textSecondary, fontSize: 13),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _Peso(
              rotulo: 'Sugerido',
              peso: item.recommendedWeight,
              cor: t.action,
            ),
            const SizedBox(height: 4),
            _Peso(rotulo: 'Na carteira', peso: item.currentWeight, cor: t.info),
          ],
        ),
      ),
    );
  }
}

/// Um peso com rótulo e barra.
///
/// A barra existe para a comparação ser lida de relance: dois percentuais
/// empilhados exigem do usuário uma subtração que a tela pode fazer por ele.
class _Peso extends StatelessWidget {
  const _Peso({required this.rotulo, required this.peso, required this.cor});

  final String rotulo;
  final double? peso;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Row(
      children: [
        SizedBox(
          width: 88,
          child: Text(
            rotulo,
            style: TextStyle(color: t.textMuted, fontSize: 12),
          ),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (peso ?? 0).clamp(0.0, 1.0),
              minHeight: 8,
              backgroundColor: t.surfaceSunken,
              valueColor: AlwaysStoppedAnimation(cor),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 64,
          child: Text(
            peso == null ? '—' : Moeda.percentual(peso!),
            textAlign: TextAlign.right,
            style: TextStyle(color: t.textSecondary, fontSize: 12),
          ),
        ),
      ],
    );
  }
}
