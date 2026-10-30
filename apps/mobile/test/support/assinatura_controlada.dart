import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/assinatura/assinatura_service.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';

class _SemToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

/// Assinatura com o acesso às projeções decidido pelo teste, sem rede.
///
/// [carregar] devolve o que [aoRecarregar] mandar, para o teste simular a
/// assinatura que venceu no meio da sessão.
class AssinaturaControlada extends AssinaturaService {
  AssinaturaControlada({this.liberada = true, this.aoRecarregar})
    : super(
        DinDinApi(
          ApiClient(
            baseUrl: 'https://api.exemplo',
            tokenProvider: _SemToken(),
            httpClient: MockClient((_) async => http.Response('{}', 500)),
          ),
        ),
      );

  bool liberada;
  bool Function()? aoRecarregar;
  int recargas = 0;

  @override
  bool get temProjecoes => liberada;

  void liberar() {
    liberada = true;
    notifyListeners();
  }

  @override
  Future<void> carregar() async {
    recargas += 1;
    if (aoRecarregar case final decidir?) liberada = decidir();
    notifyListeners();
  }
}
