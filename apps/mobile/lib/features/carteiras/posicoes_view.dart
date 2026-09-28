import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/acoes_do_item.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_vazio.dart';
import '../../shared/components/valor_ausente.dart';
import '../../shared/components/visao_recurso.dart';

/// Posições de uma carteira (issue #402).
class PosicoesView extends StatelessWidget {
  const PosicoesView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
    this.aoEditar,
    this.aoExcluir,
    this.aoMoverParaGeladeira,
  });

  final EstadoDoRecurso<List<Position>> estado;
  final VoidCallback aoRecarregar;

  /// Ausentes quando a tela é só de consulta; a linha então não mostra menu.
  final ValueChanged<Position>? aoEditar;
  final Future<void> Function(Position)? aoExcluir;
  final ValueChanged<Position>? aoMoverParaGeladeira;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<List<Position>>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      estaVazio: (posicoes) => posicoes.isEmpty,
      vazio: (_) => const EstadoVazio(
        titulo: 'Nenhuma posição nesta carteira',
        descricao: 'Registre uma compra para acompanhá-la aqui.',
        icone: Icons.show_chart,
      ),
      conteudo: (context, posicoes) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: posicoes.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) => _LinhaDaPosicao(
          posicao: posicoes[i],
          aoEditar: aoEditar,
          aoExcluir: aoExcluir,
          aoMoverParaGeladeira: aoMoverParaGeladeira,
        ),
      ),
    );
  }
}

class _LinhaDaPosicao extends StatelessWidget {
  const _LinhaDaPosicao({
    required this.posicao,
    this.aoEditar,
    this.aoExcluir,
    this.aoMoverParaGeladeira,
  });

  final Position posicao;
  final ValueChanged<Position>? aoEditar;
  final Future<void> Function(Position)? aoExcluir;
  final ValueChanged<Position>? aoMoverParaGeladeira;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final preco = posicao.currentPrice;

    return Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  posicao.ticker,
                  style: TextStyle(
                    color: t.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              // Sem cotação conhecida, a posição é declarada como tal: com o
              // preço médio no lugar do atual, o usuário leria um valor de
              // mercado que ninguém apurou.
              if (preco == null)
                ValorAusente(
                  motivo: 'Sem cotação',
                  chave: Key('sem-cotacao-${posicao.ticker}'),
                )
              else
                Text(
                  Moeda.exibir(posicao.quantity * preco),
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
                  '${Moeda.exibirSemSimbolo(posicao.quantity)} cotas · '
                  'médio ${Moeda.exibir(posicao.averagePrice)}',
                  style: TextStyle(color: t.textSecondary, fontSize: 13),
                ),
              ),
              if (preco != null) _Variacao(posicao: posicao, preco: preco),
              if (aoMoverParaGeladeira != null)
                IconButton(
                  key: Key('mover-${posicao.ticker}'),
                  onPressed: () => aoMoverParaGeladeira!(posicao),
                  icon: const Icon(Icons.ac_unit, size: 20),
                  tooltip: 'Mover para a geladeira',
                ),
              if (aoEditar != null || aoExcluir != null)
                AcoesDoItem(
                  aoEditar: aoEditar == null ? null : () => aoEditar!(posicao),
                  aoExcluir: aoExcluir == null
                      ? null
                      : () => aoExcluir!(posicao),
                  tituloDaExclusao: 'Excluir posição',
                  mensagemDaExclusao:
                      'A posição em ${posicao.ticker} será removida da '
                      'carteira. Esta ação não pode ser desfeita.',
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Valorização ou desvalorização sobre o preço médio.
///
/// Usa `positive` e `danger`, nunca o token da marca: um botão primário e um
/// número em alta não podem disputar a mesma cor na tela.
class _Variacao extends StatelessWidget {
  const _Variacao({required this.posicao, required this.preco});

  final Position posicao;
  final double preco;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final medio = posicao.averagePrice;
    final variacao = medio == 0 ? 0.0 : (preco - medio) / medio;
    final emAlta = variacao >= 0;

    return Text(
      '${emAlta ? '+' : ''}${Moeda.percentual(variacao)}',
      key: Key('variacao-${posicao.ticker}'),
      style: TextStyle(
        color: emAlta ? t.positive : t.danger,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}
