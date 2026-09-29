import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/auth/auth_service.dart';
import '../../core/data/cache_local.dart';
import '../../core/data/dindin_api.dart';
import '../../core/data/recurso.dart';
import '../../core/data/envio.dart';
import '../../core/notificacoes/notificacoes_service.dart';
import '../../core/theme/theme_controller.dart';
import '../../shared/components/modal_formulario.dart';
import '../../shared/components/seletor_tema.dart';
import '../carteiras/carteira_form.dart';
import '../carteiras/posicao_form.dart';
import '../geladeira/item_form.dart';
import '../proventos/provento_form.dart';
import '../geladeira/convite_de_notificacao.dart';
import '../simulacao/simulacao_screen.dart';
import 'ajustes_de_notificacao.dart';
import '../carteiras/carteiras_view.dart';
import '../carteiras/posicoes_view.dart';
import '../geladeira/geladeira_view.dart';
import 'geladeira_inicial.dart';
import '../patrimonio/patrimonio_view.dart';
import '../proventos/projecao_view.dart';
import '../proventos/proventos_view.dart';

/// As telas de consulta, em abas (issue #402).
///
/// Abas e não gaveta: no celular, as quatro áreas que o usuário mais abre
/// precisam estar a um toque, e a gaveta esconde todas atrás de dois.
class InicioScreen extends StatefulWidget {
  const InicioScreen({
    super.key,
    required this.auth,
    required this.api,
    required this.cache,
    required this.tema,
    required this.notificacoes,
    this.geladeiraInicial,
  });

  final AuthService auth;
  final DinDinApi api;
  final CacheLocal cache;
  final ThemeController tema;
  final NotificacoesService notificacoes;

  /// Geladeira a abrir na entrada, quando o app subiu por um toque na
  /// notificação de preço-alvo (issue #408).
  final String? geladeiraInicial;

  @override
  State<InicioScreen> createState() => _InicioScreenState();
}

class _InicioScreenState extends State<InicioScreen> {
  int _aba = 0;

  late final _patrimonio = Recurso<DashboardSummaryResponse>(
    chave: 'patrimonio',
    cache: widget.cache,
    buscar: widget.api.resumoDoPatrimonio,
    serializar: (r) => r.toJson(),
    desserializar: (json) =>
        DashboardSummaryResponse.fromJson(json as Map<String, dynamic>),
  );

  late final _carteiras = Recurso<List<Wallet>>(
    chave: 'carteiras',
    cache: widget.cache,
    buscar: widget.api.carteiras,
    serializar: (lista) => lista.map((w) => w.toJson()).toList(),
    desserializar: (json) => (json as List<dynamic>)
        .map((e) => Wallet.fromJson(e as Map<String, dynamic>))
        .toList(),
  );

  late final _geladeiras = Recurso<List<Fridge>>(
    chave: 'geladeiras',
    cache: widget.cache,
    buscar: widget.api.geladeiras,
    serializar: (lista) => lista.map((f) => f.toJson()).toList(),
    desserializar: (json) => (json as List<dynamic>)
        .map((e) => Fridge.fromJson(e as Map<String, dynamic>))
        .toList(),
  );

  Recurso<List<FridgeItem>>? _itens;

  late final _proventos = Recurso<List<DividendResponse>>(
    chave: 'proventos',
    cache: widget.cache,
    buscar: widget.api.proventos,
    serializar: (lista) => lista.map((d) => d.toJson()).toList(),
    desserializar: (json) => (json as List<dynamic>)
        .map((e) => DividendResponse.fromJson(e as Map<String, dynamic>))
        .toList(),
  );

  late final _projecao = Recurso<MonthlyIncomeResponse>(
    chave: 'projecao',
    cache: widget.cache,
    buscar: widget.api.projecaoDeProventos,
    serializar: (r) => r.toJson(),
    desserializar: (json) =>
        MonthlyIncomeResponse.fromJson(json as Map<String, dynamic>),
  );

  @override
  void initState() {
    super.initState();

    // Tocar na notificação abre a geladeira correspondente, e não a tela
    // inicial: o usuário tocou por causa de um ativo específico.
    if (widget.geladeiraInicial != null) _aba = 2;

    _patrimonio.carregar();
    _carteiras.carregar();
    _geladeiras.addListener(_abrirGeladeiraInicial);
    _geladeiras.carregar();
    _proventos.carregar();
    _projecao.carregar();
  }

  /// Abre a geladeira do alerta quando o app subiu por uma notificação, e a
  /// primeira no caso comum de quem tem uma só.
  void _abrirGeladeiraInicial() {
    final geladeiras = _geladeiras.estado.dados;
    if (geladeiras == null || _itens != null) return;

    final escolhida = escolherGeladeira(geladeiras, widget.geladeiraInicial);
    if (escolhida == null) return;

    final id = escolhida.id;
    _itens = Recurso<List<FridgeItem>>(
      chave: 'itens-$id',
      cache: widget.cache,
      buscar: () => widget.api.itensDaGeladeira(id),
      serializar: (lista) => lista.map((i) => i.toJson()).toList(),
      desserializar: (json) => (json as List<dynamic>)
          .map((e) => FridgeItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    setState(() {});
    _itens!.carregar();
  }

  @override
  void dispose() {
    _geladeiras.removeListener(_abrirGeladeiraInicial);
    _patrimonio.dispose();
    _carteiras.dispose();
    _geladeiras.dispose();
    _proventos.dispose();
    _projecao.dispose();
    _itens?.dispose();
    super.dispose();
  }

  /// Recarrega o que a operação afetou.
  ///
  /// O patrimônio e a projeção são derivados de posição, item e provento:
  /// sem isso, o usuário cadastraria uma compra e veria o total antigo — e
  /// concluiria que o app não gravou.
  Future<void> _recarregarTudo() async {
    await Future.wait([
      _patrimonio.carregar(),
      _carteiras.carregar(),
      _geladeiras.carregar(),
      _proventos.carregar(),
      _projecao.carregar(),
      if (_itens != null) _itens!.carregar(),
    ]);
  }

  /// Executa a operação e, dando certo, fecha o modal e recarrega as telas.
  ///
  /// O `Envio` é criado por operação para o erro de uma não aparecer na
  /// seguinte, e é ele que recusa o segundo toque enquanto o primeiro não
  /// respondeu.
  Future<bool> _operar(Envio envio, Future<void> Function() acao) async {
    final deuCerto = await envio.executar(acao);
    if (deuCerto) await _recarregarTudo();
    return deuCerto;
  }

  Future<void> _sair() async {
    // O cache é do usuário autenticado: deixá-lo para trás mostraria a
    // carteira de quem saiu para quem entrar depois no mesmo aparelho.
    await widget.cache.limpar();
    await widget.auth.sair();
  }

  @override
  Widget build(BuildContext context) {
    final rotulos = [
      'Patrimônio',
      'Carteiras',
      'Geladeira',
      'Proventos',
      'Simular',
    ];
    final corpos = [
      _Observando(
        _patrimonio,
        (estado) =>
            PatrimonioView(estado: estado, aoRecarregar: _patrimonio.carregar),
      ),
      _Observando(
        _carteiras,
        (estado) => CarteirasView(
          estado: estado,
          aoRecarregar: _carteiras.carregar,
          aoAbrir: _abrirPosicoes,
          aoEditar: _editarCarteira,
          aoExcluir: (carteira) =>
              _excluir(() => widget.api.excluirCarteira(carteira.id)),
        ),
      ),
      _abaGeladeira(),
      _abaProventos(),
      _Observando(
        _carteiras,
        (estado) => SimulacaoScreen(
          api: widget.api,
          carteiras: estado.dados ?? const [],
          cache: widget.cache,
        ),
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(rotulos[_aba]),
        actions: [
          IconButton(
            key: const Key('botao-sair'),
            onPressed: _sair,
            icon: const Icon(Icons.logout),
            tooltip: 'Sair',
          ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.auth.sessaoAtual?.email ?? '',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 24),
                const Text('Tema'),
                const SizedBox(height: 8),
                SeletorTema(controller: widget.tema),
                const SizedBox(height: 24),
                AjustesDeNotificacao(notificacoes: widget.notificacoes),
              ],
            ),
          ),
        ),
      ),
      body: corpos[_aba],
      floatingActionButton: _botaoDeCriar(),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: (i) => setState(() => _aba = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.pie_chart_outline),
            label: 'Patrimônio',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            label: 'Carteiras',
          ),
          NavigationDestination(icon: Icon(Icons.ac_unit), label: 'Geladeira'),
          NavigationDestination(
            icon: Icon(Icons.payments_outlined),
            label: 'Proventos',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            label: 'Simular',
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Operações de escrita (issue #403)
  // ---------------------------------------------------------------------

  /// Exclusão já confirmada por `AcoesDoItem`: aqui só resta enviar.
  Future<void> _excluir(Future<void> Function() acao) async {
    final envio = Envio();
    final deuCerto = await _operar(envio, acao);

    if (!deuCerto && mounted) _avisar(envio.erro!);
  }

  void _avisar(String mensagem) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(mensagem)));
  }

  /// Abre o modal e mantém o formulário aberto e preenchido quando o envio
  /// falha — refazer tudo no teclado do celular é onde o usuário desiste.
  Future<void> _abrirFormulario({
    required String titulo,
    required Widget Function(
      BuildContext,
      Envio,
      Future<bool> Function(Future<void> Function()),
    )
    formulario,
  }) async {
    final envio = Envio();

    await ModalFormulario.mostrar<void>(
      context,
      titulo: titulo,
      formulario: (context) => ListenableBuilder(
        listenable: envio,
        builder: (context, _) => formulario(context, envio, (acao) async {
          final deuCerto = await _operar(envio, acao);
          if (deuCerto && context.mounted) Navigator.of(context).pop();
          return deuCerto;
        }),
      ),
    );
  }

  Future<void> _criarCarteira() => _abrirFormulario(
    titulo: 'Nova carteira',
    formulario: (context, envio, salvar) => CarteiraForm(
      erro: envio.erro,
      aoSalvar: (dados) => salvar(() => widget.api.criarCarteira(dados)),
    ),
  );

  Future<void> _editarCarteira(Wallet carteira) => _abrirFormulario(
    titulo: 'Editar carteira',
    formulario: (context, envio, salvar) => CarteiraForm(
      erro: envio.erro,
      nomeInicial: carteira.name,
      descricaoInicial: carteira.description,
      aoSalvar: (dados) => salvar(
        () => widget.api.atualizarCarteira(
          carteira.id,
          UpdateWalletRequest(
            name: dados.name,
            currency: dados.currency,
            description: dados.description,
          ),
        ),
      ),
    ),
  );

  Future<void> _criarPosicao(String carteiraId) => _abrirFormulario(
    titulo: 'Nova posição',
    formulario: (context, envio, salvar) => PosicaoForm(
      erro: envio.erro,
      aoSalvar: (dados) =>
          salvar(() => widget.api.criarPosicao(carteiraId, dados)),
    ),
  );

  Future<void> _editarPosicao(String carteiraId, Position posicao) =>
      _abrirFormulario(
        titulo: 'Editar posição',
        formulario: (context, envio, salvar) => PosicaoForm(
          erro: envio.erro,
          posicaoInicial: posicao,
          aoSalvar: (dados) => salvar(
            () => widget.api.atualizarPosicao(
              carteiraId,
              posicao.id,
              UpdatePositionRequest(
                ticker: dados.ticker,
                assetType: dados.assetType,
                quantity: dados.quantity,
                averagePrice: dados.averagePrice,
              ),
            ),
          ),
        ),
      );

  /// Move a posição para a geladeira, pedindo o preço-alvo.
  ///
  /// O alvo é obrigatório porque é ele que arma o alerta: sem alvo, o item
  /// ficaria na geladeira sem nunca avisar nada.
  Future<void> _moverParaGeladeira(String carteiraId, Position posicao) async {
    final geladeira = _geladeiras.estado.dados?.firstOrNull;
    if (geladeira == null) {
      _avisar('Crie uma geladeira antes de mover uma posição para ela.');
      return;
    }

    await _abrirFormulario(
      titulo: 'Mover ${posicao.ticker} para a geladeira',
      formulario: (context, envio, salvar) => ItemForm(
        erro: envio.erro,
        itemInicial: FridgeItem(
          id: '',
          fridgeId: geladeira.id,
          ticker: posicao.ticker,
          quantity: posicao.quantity,
          transferredPrice: posicao.currentPrice ?? posicao.averagePrice,
          targetPrice: posicao.targetPrice ?? posicao.averagePrice,
          createdAt: '',
          updatedAt: '',
        ),
        aoSalvar: (dados) => salvar(
          () => widget.api.moverParaGeladeira(
            carteiraId,
            posicao.id,
            MoveToFridgeRequest(
              fridgeId: geladeira.id,
              targetPrice: dados.targetPrice,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _criarItem() async {
    final geladeira = _geladeiras.estado.dados?.firstOrNull;
    if (geladeira == null) {
      _avisar('Crie uma geladeira antes de adicionar um ativo.');
      return;
    }

    await _abrirFormulario(
      titulo: 'Novo ativo na geladeira',
      formulario: (context, envio, salvar) => ItemForm(
        erro: envio.erro,
        aoSalvar: (dados) =>
            salvar(() => widget.api.criarItemDaGeladeira(geladeira.id, dados)),
      ),
    );
  }

  Future<void> _editarItem(FridgeItem item) => _abrirFormulario(
    titulo: 'Editar ativo',
    formulario: (context, envio, salvar) => ItemForm(
      erro: envio.erro,
      itemInicial: item,
      aoSalvar: (dados) => salvar(
        () => widget.api.atualizarItemDaGeladeira(
          item.fridgeId,
          item.id,
          UpdateFridgeItemRequest(
            ticker: dados.ticker,
            quantity: dados.quantity,
            transferredPrice: dados.transferredPrice,
            targetPrice: dados.targetPrice,
          ),
        ),
      ),
    ),
  );

  /// Retira o item da geladeira, devolvendo-o à carteira escolhida.
  Future<void> _retirarDaGeladeira(FridgeItem item) async {
    final carteiras = _carteiras.estado.dados ?? const <Wallet>[];
    if (carteiras.isEmpty) {
      _avisar('Crie uma carteira antes de retirar um ativo da geladeira.');
      return;
    }

    final destino = carteiras.length == 1
        ? carteiras.single
        : await showModalBottomSheet<Wallet>(
            context: context,
            useSafeArea: true,
            builder: (context) => SafeArea(
              child: ListView(
                shrinkWrap: true,
                children: [
                  const ListTile(title: Text('Devolver para qual carteira?')),
                  for (final carteira in carteiras)
                    ListTile(
                      title: Text(carteira.name),
                      onTap: () => Navigator.of(context).pop(carteira),
                    ),
                ],
              ),
            ),
          );

    if (destino == null) return;

    final envio = Envio();
    final deuCerto = await _operar(
      envio,
      () => widget.api.retirarDaGeladeira(
        item.fridgeId,
        item.id,
        UnfreezeItemRequest(walletId: destino.id),
      ),
    );

    if (!deuCerto && mounted) _avisar(envio.erro!);
  }

  Future<void> _criarProvento() => _abrirFormulario(
    titulo: 'Novo provento',
    formulario: (context, envio, salvar) => ProventoForm(
      erro: envio.erro,
      aoSalvar: (dados) => salvar(() => widget.api.criarProvento(dados)),
    ),
  );

  Future<void> _editarProvento(DividendResponse provento) => _abrirFormulario(
    titulo: 'Editar provento',
    formulario: (context, envio, salvar) => ProventoForm(
      erro: envio.erro,
      proventoInicial: provento,
      aoSalvar: (dados) =>
          salvar(() => widget.api.atualizarProvento(provento.id, dados)),
    ),
  );

  /// O botão de criar muda com a aba: o que o usuário quer cadastrar é o que
  /// ele está olhando.
  Widget? _botaoDeCriar() => switch (_aba) {
    1 => FloatingActionButton(
      key: const Key('criar-carteira'),
      onPressed: _criarCarteira,
      tooltip: 'Nova carteira',
      child: const Icon(Icons.add),
    ),
    2 => FloatingActionButton(
      key: const Key('criar-item'),
      onPressed: _criarItem,
      tooltip: 'Novo ativo na geladeira',
      child: const Icon(Icons.add),
    ),
    3 => FloatingActionButton(
      key: const Key('criar-provento'),
      onPressed: _criarProvento,
      tooltip: 'Novo provento',
      child: const Icon(Icons.add),
    ),
    _ => null,
  };

  void _abrirPosicoes(Wallet carteira) {
    final posicoes = Recurso<List<Position>>(
      chave: 'posicoes-${carteira.id}',
      cache: widget.cache,
      buscar: () => widget.api.posicoes(carteira.id),
      serializar: (lista) => lista.map((p) => p.toJson()).toList(),
      desserializar: (json) => (json as List<dynamic>)
          .map((e) => Position.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    posicoes.carregar();

    Navigator.of(context)
        .push(
          MaterialPageRoute<void>(
            builder: (_) => Scaffold(
              appBar: AppBar(title: Text(carteira.name)),
              body: _Observando(
                posicoes,
                (estado) => PosicoesView(
                  estado: estado,
                  aoRecarregar: posicoes.carregar,
                  aoEditar: (posicao) async {
                    await _editarPosicao(carteira.id, posicao);
                    await posicoes.carregar();
                  },
                  aoExcluir: (posicao) async {
                    await _excluir(
                      () => widget.api.excluirPosicao(carteira.id, posicao.id),
                    );
                    await posicoes.carregar();
                  },
                  aoMoverParaGeladeira: (posicao) async {
                    await _moverParaGeladeira(carteira.id, posicao);
                    await posicoes.carregar();
                  },
                ),
              ),
              floatingActionButton: FloatingActionButton(
                key: const Key('criar-posicao'),
                onPressed: () async {
                  await _criarPosicao(carteira.id);
                  await posicoes.carregar();
                },
                tooltip: 'Nova posição',
                child: const Icon(Icons.add),
              ),
            ),
          ),
        )
        .then((_) => posicoes.dispose());
  }

  Widget _abaGeladeira() {
    final itens = _itens;

    // Sem geladeira cadastrada não há itens a buscar: o estado da lista de
    // geladeiras é o que a aba mostra, para não ficar carregando para sempre.
    if (itens == null) {
      return _Observando(
        _geladeiras,
        (estado) => GeladeiraView(
          estado: EstadoDoRecurso<List<FridgeItem>>(
            dados: (estado.dados?.isEmpty ?? false) ? const [] : null,
            carregando: estado.carregando,
            erro: estado.erro,
          ),
          aoRecarregar: _geladeiras.carregar,
        ),
      );
    }

    return Column(
      children: [
        // O convite fica na geladeira, que é onde o alerta acontece: pedir a
        // permissão na primeira abertura, sem contexto, é o jeito mais rápido
        // de receber um "não" definitivo.
        ConviteDeNotificacao(notificacoes: widget.notificacoes),
        Expanded(child: _listaDaGeladeira(itens)),
      ],
    );
  }

  Widget _listaDaGeladeira(Recurso<List<FridgeItem>> itens) {
    return _Observando(
      itens,
      (estado) => GeladeiraView(
        estado: estado,
        aoRecarregar: itens.carregar,
        aoEditar: _editarItem,
        aoExcluir: (item) => _excluir(
          () => widget.api.excluirItemDaGeladeira(item.fridgeId, item.id),
        ),
        aoRetirar: _retirarDaGeladeira,
      ),
    );
  }

  Widget _abaProventos() => DefaultTabController(
    length: 2,
    child: Column(
      children: [
        const TabBar(
          tabs: [
            Tab(text: 'Recebidos'),
            Tab(text: 'Projetados'),
          ],
        ),
        Expanded(
          child: TabBarView(
            children: [
              _Observando(
                _proventos,
                (estado) => ProventosView(
                  estado: estado,
                  aoRecarregar: _proventos.carregar,
                  aoEditar: _editarProvento,
                  aoExcluir: (provento) =>
                      _excluir(() => widget.api.excluirProvento(provento.id)),
                ),
              ),
              _Observando(
                _projecao,
                (estado) => ProjecaoView(
                  estado: estado,
                  aoRecarregar: _projecao.carregar,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Reconstrói a tela a cada mudança do recurso.
class _Observando<T> extends StatelessWidget {
  const _Observando(this.recurso, this.construir);

  final Recurso<T> recurso;
  final Widget Function(EstadoDoRecurso<T>) construir;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: recurso,
    builder: (_, _) => construir(recurso.estado),
  );
}
