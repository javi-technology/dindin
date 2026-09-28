import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/auth/auth_service.dart';
import '../../core/data/cache_local.dart';
import '../../core/data/dindin_api.dart';
import '../../core/data/recurso.dart';
import '../../core/theme/theme_controller.dart';
import '../../shared/components/seletor_tema.dart';
import '../carteiras/carteiras_view.dart';
import '../carteiras/posicoes_view.dart';
import '../geladeira/geladeira_view.dart';
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
  });

  final AuthService auth;
  final DinDinApi api;
  final CacheLocal cache;
  final ThemeController tema;

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
    _patrimonio.carregar();
    _carteiras.carregar();
    _geladeiras.addListener(_abrirPrimeiraGeladeira);
    _geladeiras.carregar();
    _proventos.carregar();
    _projecao.carregar();
  }

  /// Na prática o usuário tem uma geladeira; abrir a primeira poupa um toque
  /// no caso comum.
  void _abrirPrimeiraGeladeira() {
    final geladeiras = _geladeiras.estado.dados;
    if (geladeiras == null || geladeiras.isEmpty || _itens != null) return;

    final id = geladeiras.first.id;
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
    _geladeiras.removeListener(_abrirPrimeiraGeladeira);
    _patrimonio.dispose();
    _carteiras.dispose();
    _geladeiras.dispose();
    _proventos.dispose();
    _projecao.dispose();
    _itens?.dispose();
    super.dispose();
  }

  Future<void> _sair() async {
    // O cache é do usuário autenticado: deixá-lo para trás mostraria a
    // carteira de quem saiu para quem entrar depois no mesmo aparelho.
    await widget.cache.limpar();
    await widget.auth.sair();
  }

  @override
  Widget build(BuildContext context) {
    final rotulos = ['Patrimônio', 'Carteiras', 'Geladeira', 'Proventos'];
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
        ),
      ),
      _abaGeladeira(),
      _abaProventos(),
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
              ],
            ),
          ),
        ),
      ),
      body: corpos[_aba],
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
        ],
      ),
    );
  }

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
                ),
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

    return _Observando(
      itens,
      (estado) => GeladeiraView(estado: estado, aoRecarregar: itens.carregar),
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
