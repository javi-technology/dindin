import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/cache_local.dart';
import '../../core/data/dindin_api.dart';
import '../../core/data/envio.dart';
import '../../core/data/recurso.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/estado_erro.dart';
import '../../shared/components/selo_assinante.dart';
import '../../shared/components/visao_recurso.dart';
import 'comparacao_view.dart';
import 'resultado_view.dart';
import 'simulacao_form.dart';

/// Carteira sugerida e simulação (issue #404).
///
/// São o diferencial do DinDin, e ficariam de fora do app se a paridade
/// parasse nas telas de carteira própria. A simulação geral é gratuita; a por
/// ativo específico é de assinante, e sua liberação depende de compra in-app
/// (issue #405) — aqui ela só é anunciada.
class SimulacaoScreen extends StatefulWidget {
  const SimulacaoScreen({
    super.key,
    required this.api,
    required this.carteiras,
    required this.cache,
  });

  final DinDinApi api;

  /// Cache das consultas da tela (#404): o app mostra o último estado
  /// conhecido enquanto busca o atual, como as demais telas já fazem.
  final CacheLocal cache;

  /// Carteiras do usuário, para a comparação. Vazia enquanto não carregaram.
  final List<Wallet> carteiras;

  @override
  State<SimulacaoScreen> createState() => _SimulacaoScreenState();
}

class _SimulacaoScreenState extends State<SimulacaoScreen> {
  final _envio = Envio();

  late final _carteirasSugeridas = Recurso<List<SimulationWalletOption>>(
    chave: 'simulacao-carteiras',
    cache: widget.cache,
    buscar: widget.api.carteirasParaSimular,
    serializar: (lista) => lista.map((opcao) => opcao.toJson()).toList(),
    desserializar: (json) => (json as List<dynamic>)
        .map(
          (item) =>
              SimulationWalletOption.fromJson(item as Map<String, dynamic>),
        )
        .toList(),
  );

  WalletSimulationResponse? _resultado;

  @override
  void initState() {
    super.initState();
    _carteirasSugeridas.addListener(_aoMudar);
    _carteirasSugeridas.carregar();
  }

  void _aoMudar() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _carteirasSugeridas.removeListener(_aoMudar);
    _carteirasSugeridas.dispose();
    _envio.dispose();
    super.dispose();
  }

  Future<bool> _simular(WalletSimulationRequest dados) async {
    WalletSimulationResponse? resposta;

    final deuCerto = await _envio.executar(() async {
      resposta = await widget.api.simularCarteira(dados);
    });

    if (deuCerto && mounted) setState(() => _resultado = resposta);
    return deuCerto;
  }

  /// A simulação por ativo é recurso de assinante, e a liberação no app
  /// depende de compra in-app. Até lá, tocar aqui explica o que falta em vez
  /// de mostrar um erro 402 cru.
  void _avisarRecursoDeAssinante(SimulationItem item) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Simular ${item.ticker} isoladamente é um recurso de assinante.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const TabBar(
            tabs: [
              Tab(text: 'Simular'),
              Tab(text: 'Comparar'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                VisaoRecurso<List<SimulationWalletOption>>(
                  estado: _carteirasSugeridas.estado,
                  aoRecarregar: _carteirasSugeridas.carregar,
                  conteudo: (context, disponiveis) => _abaSimular(disponiveis),
                ),
                _abaComparar(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _abaSimular(List<SimulationWalletOption> disponiveis) {
    final resultado = _resultado;

    return ListenableBuilder(
      listenable: _envio,
      builder: (context, _) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Simulação por carteira sugerida',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text(
                'Grátis',
                style: TextStyle(
                  color: context.tokens.positiveInk,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SimulacaoForm(
            carteiras: disponiveis,
            aoSimular: _simular,
            erro: _envio.erro,
          ),
          if (resultado != null) ...[
            const Divider(height: 48),
            // O resultado é lista dentro de lista, então rola junto com o
            // formulário em vez de disputar a rolagem com ele.
            ResultadoView(
              resultado: resultado,
              aoSimularAtivo: _avisarRecursoDeAssinante,
            ),
          ] else ...[
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                SeloAssinante(),
                SizedBox(width: 8),
                Flexible(
                  child: Text(
                    'Simular um ativo isoladamente é recurso de assinante.',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _abaComparar() {
    final carteira = widget.carteiras.firstOrNull;
    if (carteira == null) {
      return const EstadoErro(
        mensagem: 'Crie uma carteira para compará-la com a sugerida.',
      );
    }

    return _Comparacao(
      api: widget.api,
      cache: widget.cache,
      carteiraId: carteira.id,
    );
  }
}

/// Carrega e mostra a comparação de uma carteira.
class _Comparacao extends StatefulWidget {
  const _Comparacao({
    required this.api,
    required this.cache,
    required this.carteiraId,
  });

  final DinDinApi api;
  final CacheLocal cache;
  final String carteiraId;

  @override
  State<_Comparacao> createState() => _ComparacaoState();
}

class _ComparacaoState extends State<_Comparacao> {
  late final _comparacao = Recurso<RecommendedWalletComparison>(
    chave: 'comparacao-${widget.carteiraId}',
    cache: widget.cache,
    buscar: () => widget.api.compararComSugerida(widget.carteiraId),
    serializar: (comparacao) => comparacao.toJson(),
    desserializar: (json) =>
        RecommendedWalletComparison.fromJson(json as Map<String, dynamic>),
  );

  @override
  void initState() {
    super.initState();
    _comparacao.addListener(_aoMudar);
    _comparacao.carregar();
  }

  void _aoMudar() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _comparacao.removeListener(_aoMudar);
    _comparacao.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ComparacaoView(
    estado: _comparacao.estado,
    aoRecarregar: _comparacao.carregar,
  );
}
