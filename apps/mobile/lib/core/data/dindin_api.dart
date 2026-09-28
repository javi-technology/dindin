import '../../contracts/contracts.g.dart';
import '../api/api_client.dart';

/// As rotas da API do DinDin, tipadas pelos modelos gerados (issue #402).
///
/// As telas não tocam em `Map<String, dynamic>`: quando um campo é renomeado
/// na API, a descrição OpenAPI é regerada e o app **para de compilar** — em
/// vez de exibir zero no celular do usuário, depois de o deploy ter passado
/// no CI.
class DinDinApi {
  const DinDinApi(this._client);

  final ApiClient _client;

  Future<DashboardSummaryResponse> resumoDoPatrimonio() async =>
      DashboardSummaryResponse.fromJson(
        await _client.get('/api/dashboard/summary') as Map<String, dynamic>,
      );

  Future<List<Wallet>> carteiras() async =>
      _lista(await _client.get('/api/wallets'), Wallet.fromJson);

  Future<List<Position>> posicoes(String carteiraId) async => _lista(
    await _client.get('/api/wallets/$carteiraId/positions'),
    Position.fromJson,
  );

  Future<List<Fridge>> geladeiras() async =>
      _lista(await _client.get('/api/fridges'), Fridge.fromJson);

  Future<List<FridgeItem>> itensDaGeladeira(String geladeiraId) async => _lista(
    await _client.get('/api/fridges/$geladeiraId/items'),
    FridgeItem.fromJson,
  );

  Future<List<DividendResponse>> proventos() async =>
      _lista(await _client.get('/api/dividends'), DividendResponse.fromJson);

  Future<MonthlyIncomeResponse> projecaoDeProventos() async =>
      MonthlyIncomeResponse.fromJson(
        await _client.get('/api/dividends/projection') as Map<String, dynamic>,
      );

  Future<MonthlyDividendReport> relatorioMensal({int? ano}) async =>
      MonthlyDividendReport.fromJson(
        await _client.get(
          '/api/dividends/monthly-report',
          query: ano == null ? null : {'year': '$ano'},
        ) as Map<String, dynamic>,
      );

  // -------------------------------------------------------------------------
  // Escrita (issue #403)
  // -------------------------------------------------------------------------

  Future<Wallet> criarCarteira(CreateWalletRequest dados) async =>
      Wallet.fromJson(
        await _client.post('/api/wallets', body: dados.toJson())
            as Map<String, dynamic>,
      );

  Future<Wallet> atualizarCarteira(
    String id,
    UpdateWalletRequest dados,
  ) async => Wallet.fromJson(
    await _client.put('/api/wallets/$id', body: dados.toJson())
        as Map<String, dynamic>,
  );

  Future<void> excluirCarteira(String id) => _client.delete('/api/wallets/$id');

  Future<Position> criarPosicao(
    String carteiraId,
    CreatePositionRequest dados,
  ) async => Position.fromJson(
    await _client.post(
      '/api/wallets/$carteiraId/positions',
      body: dados.toJson(),
    ) as Map<String, dynamic>,
  );

  /// Atualiza a posição.
  ///
  /// `toJson` omite o opcional não enviado, o que é o certo para não apagar no
  /// servidor o que o app não conhece. Mas remover o preço-alvo **exige**
  /// mandar `targetPrice: null` explícito: omitir o campo manteria o alvo
  /// gravado, e são pedidos diferentes — daí [removerPrecoAlvo].
  Future<Position> atualizarPosicao(
    String carteiraId,
    String id,
    UpdatePositionRequest dados, {
    bool removerPrecoAlvo = false,
  }) async {
    final corpo = dados.toJson();
    if (removerPrecoAlvo) corpo['targetPrice'] = null;

    return Position.fromJson(
      await _client.put('/api/wallets/$carteiraId/positions/$id', body: corpo)
          as Map<String, dynamic>,
    );
  }

  Future<void> excluirPosicao(String carteiraId, String id) =>
      _client.delete('/api/wallets/$carteiraId/positions/$id');

  Future<FridgeItem> moverParaGeladeira(
    String carteiraId,
    String posicaoId,
    MoveToFridgeRequest dados,
  ) async => FridgeItem.fromJson(
    await _client.post(
      '/api/wallets/$carteiraId/positions/$posicaoId/move-to-fridge',
      body: dados.toJson(),
    ) as Map<String, dynamic>,
  );

  Future<FridgeItem> criarItemDaGeladeira(
    String geladeiraId,
    CreateFridgeItemRequest dados,
  ) async => FridgeItem.fromJson(
    await _client.post('/api/fridges/$geladeiraId/items', body: dados.toJson())
        as Map<String, dynamic>,
  );

  Future<FridgeItem> atualizarItemDaGeladeira(
    String geladeiraId,
    String id,
    UpdateFridgeItemRequest dados,
  ) async => FridgeItem.fromJson(
    await _client.put(
      '/api/fridges/$geladeiraId/items/$id',
      body: dados.toJson(),
    ) as Map<String, dynamic>,
  );

  Future<void> excluirItemDaGeladeira(String geladeiraId, String id) =>
      _client.delete('/api/fridges/$geladeiraId/items/$id');

  Future<Position> retirarDaGeladeira(
    String geladeiraId,
    String id,
    UnfreezeItemRequest dados,
  ) async => Position.fromJson(
    await _client.post(
      '/api/fridges/$geladeiraId/items/$id/unfreeze',
      body: dados.toJson(),
    ) as Map<String, dynamic>,
  );

  Future<DividendResponse> criarProvento(DividendCreateRequest dados) async =>
      DividendResponse.fromJson(
        await _client.post('/api/dividends', body: dados.toJson())
            as Map<String, dynamic>,
      );

  Future<DividendResponse> atualizarProvento(
    String id,
    DividendCreateRequest dados,
  ) async => DividendResponse.fromJson(
    await _client.put('/api/dividends/$id', body: dados.toJson())
        as Map<String, dynamic>,
  );

  Future<void> excluirProvento(String id) =>
      _client.delete('/api/dividends/$id');

  // -------------------------------------------------------------------------
  // Carteira sugerida e simulação (issue #404)
  // -------------------------------------------------------------------------

  /// Carteiras sugeridas disponíveis, com os meses que cada uma publicou.
  ///
  /// O sistema prevê mais de uma além da do BB, então a tela escolhe qual
  /// consultar em vez de assumir uma só.
  Future<List<SimulationWalletOption>> carteirasParaSimular() async => _lista(
    await _client.get('/api/simulations/wallets'),
    SimulationWalletOption.fromJson,
  );

  /// Simulação geral por carteira sugerida — **gratuita**.
  Future<WalletSimulationResponse> simularCarteira(
    WalletSimulationRequest dados,
  ) async => WalletSimulationResponse.fromJson(
    await _client.post('/api/simulations/wallet', body: dados.toJson())
        as Map<String, dynamic>,
  );

  /// Simulação por ativo específico — recurso de assinante.
  ///
  /// Sem o entitlement, a API responde 402 com `code:
  /// 'SUBSCRIPTION_REQUIRED'`, que o app reconhece para oferecer a assinatura
  /// em vez de mostrar "erro". A liberação no app depende de compra in-app
  /// (issue #405).
  Future<AssetSimulationResponse> simularAtivo(
    AssetSimulationRequest dados,
  ) async => AssetSimulationResponse.fromJson(
    await _client.post('/api/simulations/asset', body: dados.toJson())
        as Map<String, dynamic>,
  );

  Future<RecommendedWallet> carteiraSugerida() async =>
      RecommendedWallet.fromJson(
        await _client.get('/api/recommended-wallets/bb-fii/latest')
            as Map<String, dynamic>,
      );

  Future<RecommendedWalletComparison> compararComSugerida(
    String carteiraId,
  ) async => RecommendedWalletComparison.fromJson(
    await _client.get('/api/recommended-wallets/bb-fii/compare/$carteiraId')
        as Map<String, dynamic>,
  );

  static List<T> _lista<T>(
    dynamic corpo,
    T Function(Map<String, dynamic>) converter,
  ) => (corpo as List<dynamic>)
      .map((item) => converter(item as Map<String, dynamic>))
      .toList();
}
