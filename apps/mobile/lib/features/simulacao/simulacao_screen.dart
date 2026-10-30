import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/api/api_exception.dart';
import '../../core/assinatura/assinatura_service.dart';
import '../assinatura/planos_da_loja.dart';
import '../../core/data/cache_local.dart';
import '../../core/data/dindin_api.dart';
import '../../core/data/envio.dart';
import '../../core/data/recurso.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_erro.dart';
import '../../shared/components/selo_assinante.dart';
import '../../shared/components/visao_recurso.dart';
import 'comparacao_view.dart';
import 'resultado_view.dart';
import 'simulacao_form.dart';
import 'sugestoes_view.dart';

/// Carteira sugerida e simulação (issue #404).
///
/// São o diferencial do DinDin, e ficariam de fora do app se a paridade
/// parasse nas telas de carteira própria. A simulação inteira é de assinante
/// (issue #573): sem acesso, a aba mostra o paywall no lugar dela.
class SimulacaoScreen extends StatefulWidget {
  const SimulacaoScreen({
    super.key,
    required this.api,
    required this.carteiras,
    required this.cache,
    required this.assinatura,
  });

  final DinDinApi api;

  /// Cache das consultas da tela (#404): o app mostra o último estado
  /// conhecido enquanto busca o atual, como as demais telas já fazem.
  final CacheLocal cache;

  /// Status da assinatura (#442). A simulação é paga; quem já assina pela web
  /// precisa encontrá-la liberada aqui.
  final AssinaturaService assinatura;

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
  bool _buscouCarteiras = false;

  @override
  void initState() {
    super.initState();
    _carteirasSugeridas.addListener(_aoMudar);
    widget.assinatura.addListener(_aoMudarAssinatura);
    _buscarCarteirasSeLiberada();
  }

  void _aoMudar() {
    if (mounted) setState(() {});
  }

  /// A assinatura comprada dentro do app chega com a tela já aberta.
  void _aoMudarAssinatura() {
    _buscarCarteirasSeLiberada();
    _aoMudar();
  }

  /// A API recusa as carteiras a quem não assina: buscá-las antes só traria
  /// um erro para a tela onde deve estar o paywall.
  void _buscarCarteirasSeLiberada() {
    if (_buscouCarteiras || !widget.assinatura.temProjecoes) return;
    _buscouCarteiras = true;
    _carteirasSugeridas.carregar();
  }

  @override
  void dispose() {
    widget.assinatura.removeListener(_aoMudarAssinatura);
    _carteirasSugeridas.removeListener(_aoMudar);
    _carteirasSugeridas.dispose();
    _envio.dispose();
    super.dispose();
  }

  Future<bool> _simular(WalletSimulationRequest dados) async {
    WalletSimulationResponse? resposta;
    var semAssinatura = false;

    final deuCerto = await _envio.executar(() async {
      try {
        resposta = await widget.api.simularCarteira(dados);
      } on ApiException catch (erro) {
        semAssinatura = erro.code == codigoAssinaturaNecessaria;
        rethrow;
      }
    });

    // Assinatura vencida no meio da sessão: relê o status, e a tela volta ao
    // paywall em vez de mostrar "Acesso negado".
    if (semAssinatura) await widget.assinatura.carregar();
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
                if (widget.assinatura.temProjecoes)
                  VisaoRecurso<List<SimulationWalletOption>>(
                    estado: _carteirasSugeridas.estado,
                    aoRecarregar: _carteirasSugeridas.carregar,
                    conteudo: (context, disponiveis) =>
                        _abaSimular(disponiveis),
                  )
                else
                  _paywall(),
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
          Text(
            'Simulação por carteira sugerida',
            style: Theme.of(context).textTheme.titleMedium,
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
          ],
        ],
      ),
    );
  }

  Widget _paywall() {
    final t = context.tokens;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Cartao(
          key: const Key('paywall-simulacao'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SeloAssinante(),
              const SizedBox(height: 12),
              Text(
                'Disponível para assinantes',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Assine para simular quanto um valor renderia de proventos na '
                'carteira sugerida ou em um ativo específico.',
                style: TextStyle(color: t.textSecondary),
              ),
              if (widget.assinatura.loja case final loja?) ...[
                const SizedBox(height: 16),
                FilledButton(
                  key: const Key('ver-planos'),
                  onPressed: () => abrirPlanosDaLoja(context, loja),
                  child: const Text('Ver planos'),
                ),
              ],
            ],
          ),
        ),
      ],
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
      temIa: widget.assinatura.temIa,
    );
  }
}

/// Carrega e mostra a comparação de uma carteira.
class _Comparacao extends StatefulWidget {
  const _Comparacao({
    required this.api,
    required this.cache,
    required this.carteiraId,
    required this.temIa,
  });

  final DinDinApi api;
  final CacheLocal cache;
  final String carteiraId;

  /// Entitlement `ai`, que libera as sugestões (#446).
  final bool temIa;

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

  AiSuggestion? _sugestao;
  bool _buscouSugestao = false;
  bool _gerando = false;
  String? _erroDaSugestao;

  @override
  void initState() {
    super.initState();
    _comparacao.addListener(_aoMudar);
    _comparacao.carregar();
    // A sugestão depende do mês da carteira sugerida, que vem na comparação:
    // só dá para buscá-la depois que ela chega.
    _comparacao.addListener(_aoChegarComparacao);
  }

  void _aoMudar() {
    if (mounted) setState(() {});
  }

  /// O mês da carteira sugerida, exigido pelas rotas de sugestão.
  String? get _mes => _comparacao.estado.dados?.recommended.month;

  void _aoChegarComparacao() {
    if (widget.temIa && _mes != null && !_buscouSugestao) {
      _buscouSugestao = true;
      _carregarSugestao();
    }
  }

  /// Lê a última sugestão já gerada. Falhar aqui é silencioso: a tela ainda
  /// oferece gerar, e um aviso antes de o usuário pedir nada seria ruído.
  Future<void> _carregarSugestao() async {
    try {
      final ultima = await widget.api.sugestao(
        carteiraId: widget.carteiraId,
        mes: _mes!,
        aba: AiSuggestionTab.renda,
      );
      if (mounted) setState(() => _sugestao = ultima);
    } catch (_) {
      // sem sugestão em mãos, o botão de gerar segue disponível
    }
  }

  Future<void> _gerarSugestao() async {
    setState(() {
      _gerando = true;
      _erroDaSugestao = null;
    });

    try {
      final nova = await widget.api.gerarSugestao(
        carteiraId: widget.carteiraId,
        mes: _mes!,
        aba: AiSuggestionTab.renda,
      );
      if (mounted) setState(() => _sugestao = nova);
    } catch (erro) {
      if (mounted) {
        setState(
          () => _erroDaSugestao = erro is ApiException
              ? erro.message
              : 'Não foi possível gerar a sugestão. Tente de novo.',
        );
      }
    } finally {
      if (mounted) setState(() => _gerando = false);
    }
  }

  @override
  void dispose() {
    _comparacao.removeListener(_aoMudar);
    _comparacao.removeListener(_aoChegarComparacao);
    _comparacao.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ComparacaoView(
    estado: _comparacao.estado,
    aoRecarregar: _comparacao.carregar,
    rodape: SugestoesView(
      sugestao: _sugestao,
      temAcesso: widget.temIa,
      // Sem o mês da carteira sugerida a API recusa o pedido, então o botão
      // só libera quando a comparação chega.
      carregando: _gerando || _mes == null,
      erro: _erroDaSugestao,
      aoGerar: _gerarSugestao,
    ),
  );
}
