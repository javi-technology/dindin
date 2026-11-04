import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/dindin_api.dart';
import '../../core/data/recurso.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/visao_recurso.dart';

/// O que o quadro cruza: a publicação do BB e o que o usuário tem.
class DadosDeEntraESai {
  const DadosDeEntraESai({
    required this.sugerida,
    required this.carteiras,
    required this.posicoes,
    required this.itens,
  });

  factory DadosDeEntraESai.fromJson(Map<String, dynamic> json) =>
      DadosDeEntraESai(
        sugerida: RecommendedWallet.fromJson(
          json['sugerida'] as Map<String, dynamic>,
        ),
        carteiras: (json['carteiras'] as List<dynamic>)
            .map((e) => Wallet.fromJson(e as Map<String, dynamic>))
            .toList(),
        posicoes: (json['posicoes'] as List<dynamic>)
            .map((e) => Position.fromJson(e as Map<String, dynamic>))
            .toList(),
        itens: (json['itens'] as List<dynamic>)
            .map((e) => FridgeItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  /// Só o mês mais recente: a rota `latest` devolve a última carteira, e mover
  /// ou descongelar não faz sentido sobre uma recomendação passada. Se o app
  /// passar a navegar entre meses, as ações precisam ser limitadas, como no web.
  ///
  /// Sem mudança para cruzar, não busca as posições de cada carteira.
  static Future<DadosDeEntraESai> buscar(DinDinApi api) async {
    final sugerida = await api.carteiraSugerida();
    final mudancas = sugerida.changes;
    final temMudanca = [
      mudancas?.renda,
      mudancas?.ganho,
    ].any((m) => m != null && (m.entering.isNotEmpty || m.leaving.isNotEmpty));
    if (!temMudanca) {
      return DadosDeEntraESai(
        sugerida: sugerida,
        carteiras: const [],
        posicoes: const [],
        itens: const [],
      );
    }

    final carteiras = await api.carteiras();
    final geladeiras = await api.geladeiras();
    final posicoes = await Future.wait(
      carteiras.map((carteira) => api.posicoes(carteira.id)),
    );
    final itens = await Future.wait(
      geladeiras.map((geladeira) => api.itensDaGeladeira(geladeira.id)),
    );
    return DadosDeEntraESai(
      sugerida: sugerida,
      carteiras: carteiras,
      posicoes: posicoes.expand((lista) => lista).toList(),
      itens: itens.expand((lista) => lista).toList(),
    );
  }

  final RecommendedWallet sugerida;
  final List<Wallet> carteiras;
  final List<Position> posicoes;
  final List<FridgeItem> itens;

  Map<String, dynamic> toJson() => {
    'sugerida': sugerida.toJson(),
    'carteiras': carteiras.map((c) => c.toJson()).toList(),
    'posicoes': posicoes.map((p) => p.toJson()).toList(),
    'itens': itens.map((i) => i.toJson()).toList(),
  };
}

/// Quadro "Entra e sai do mês" (issue #586).
///
/// Mostra o que o BB publica e cruza com o que o usuário tem: o fundo que sai e
/// está em carteira pode ir para a geladeira, e o que entra e está na geladeira
/// pode ser descongelado. Sempre por decisão do usuário.
class EntraESaiView extends StatelessWidget {
  const EntraESaiView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
    required this.aoMover,
    required this.aoDescongelar,
  });

  final EstadoDoRecurso<DadosDeEntraESai> estado;
  final VoidCallback aoRecarregar;
  final Future<void> Function(Position) aoMover;
  final Future<void> Function(FridgeItem) aoDescongelar;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<DadosDeEntraESai>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      conteudo: (context, dados) {
        final mudancas = dados.sugerida.changes;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _CartaoDaCarteira(
              chave: 'renda',
              titulo: 'Carteira Renda',
              mudanca: mudancas?.renda,
              outraCarteira: 'Carteira Ganho',
              naOutra: dados.sugerida.ganho,
              dados: dados,
              aoMover: aoMover,
              aoDescongelar: aoDescongelar,
            ),
            const SizedBox(height: 12),
            _CartaoDaCarteira(
              chave: 'ganho',
              titulo: 'Carteira Ganho',
              mudanca: mudancas?.ganho,
              outraCarteira: 'Carteira Renda',
              naOutra: dados.sugerida.renda,
              dados: dados,
              aoMover: aoMover,
              aoDescongelar: aoDescongelar,
            ),
          ],
        );
      },
    );
  }
}

class _CartaoDaCarteira extends StatelessWidget {
  const _CartaoDaCarteira({
    required this.chave,
    required this.titulo,
    required this.mudanca,
    required this.outraCarteira,
    required this.naOutra,
    required this.dados,
    required this.aoMover,
    required this.aoDescongelar,
  });

  final String chave;
  final String titulo;
  final RecommendedWalletChange? mudanca;
  final String outraCarteira;
  final List<RecommendedWalletAsset> naOutra;
  final DadosDeEntraESai dados;
  final Future<void> Function(Position) aoMover;
  final Future<void> Function(FridgeItem) aoDescongelar;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final mudanca = this.mudanca;

    Widget aviso(String sufixo, String texto) => Text(
      texto,
      key: Key('$chave-$sufixo'),
      style: TextStyle(color: t.textMuted),
    );

    return Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            titulo,
            style: TextStyle(color: t.textPrimary, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          if (mudanca == null)
            aviso('nao-informado', 'Não informado neste relatório.')
          else if (mudanca.entering.isEmpty && mudanca.leaving.isEmpty)
            aviso('sem-alteracoes', 'Sem alterações neste mês.')
          else ...[
            for (final ticker in mudanca.leaving) _saindo(context, ticker),
            for (final ticker in mudanca.entering) _entrando(context, ticker),
          ],
        ],
      ),
    );
  }

  Widget _saindo(BuildContext context, String ticker) {
    final t = context.tokens;
    // Trocar de carteira não é sair da recomendação.
    final continua = naOutra.any((ativo) => ativo.ticker == ticker);
    final posicoes = continua
        ? const <Position>[]
        : dados.posicoes.where((p) => p.ticker == ticker && !p.inFridge);

    return _Fundo(
      chave: 'saindo-$ticker',
      rotulo: 'Sai',
      corDoRotulo: t.dangerInk,
      ticker: ticker,
      detalhes: [
        if (continua)
          Text(
            'Continua recomendado na $outraCarteira.',
            style: TextStyle(color: t.textMuted, fontSize: 13),
          ),
        for (final posicao in posicoes)
          _Detalhe(
            texto:
                '${Moeda.exibirSemSimbolo(posicao.quantity)} cotas em '
                '${_nomeDaCarteira(posicao.walletId)}',
            chaveDaAcao: 'mover-${posicao.id}',
            rotuloDaAcao: 'Mover para a geladeira',
            aoAgir: () => aoMover(posicao),
          ),
      ],
    );
  }

  Widget _entrando(BuildContext context, String ticker) {
    final itens = dados.itens.where((item) => item.ticker == ticker);

    return _Fundo(
      chave: 'entrando-$ticker',
      rotulo: 'Entra',
      corDoRotulo: context.tokens.positiveInk,
      ticker: ticker,
      detalhes: [
        for (final item in itens)
          _Detalhe(
            texto:
                '${Moeda.exibirSemSimbolo(item.quantity)} cotas na geladeira',
            chaveDaAcao: 'descongelar-${item.id}',
            rotuloDaAcao: 'Descongelar',
            aoAgir: () => aoDescongelar(item),
          ),
      ],
    );
  }

  String _nomeDaCarteira(String id) {
    for (final carteira in dados.carteiras) {
      if (carteira.id == id) return carteira.name;
    }
    return 'sua carteira';
  }
}

class _Fundo extends StatelessWidget {
  const _Fundo({
    required this.chave,
    required this.rotulo,
    required this.corDoRotulo,
    required this.ticker,
    required this.detalhes,
  });

  final String chave;
  final String rotulo;
  final Color corDoRotulo;
  final String ticker;
  final List<Widget> detalhes;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: Key(chave),
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '$rotulo  ',
                  style: TextStyle(
                    color: corDoRotulo,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                TextSpan(
                  text: ticker,
                  style: TextStyle(
                    color: context.tokens.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          ...detalhes,
        ],
      ),
    );
  }
}

class _Detalhe extends StatelessWidget {
  const _Detalhe({
    required this.texto,
    required this.chaveDaAcao,
    required this.rotuloDaAcao,
    required this.aoAgir,
  });

  final String texto;
  final String chaveDaAcao;
  final String rotuloDaAcao;
  final VoidCallback aoAgir;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          texto,
          style: TextStyle(color: context.tokens.textSecondary, fontSize: 13),
        ),
        TextButton(
          key: Key(chaveDaAcao),
          onPressed: aoAgir,
          child: Text(rotuloDaAcao),
        ),
      ],
    );
  }
}
