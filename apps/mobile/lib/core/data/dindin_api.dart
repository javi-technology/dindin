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

  static List<T> _lista<T>(
    dynamic corpo,
    T Function(Map<String, dynamic>) converter,
  ) => (corpo as List<dynamic>)
      .map((item) => converter(item as Map<String, dynamic>))
      .toList();
}
