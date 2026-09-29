import '../data/dindin_api.dart';

/// Garante a Carteira Principal e a Geladeira Principal do usuário (#440).
///
/// Os nomes e a regra moram na API (`POST /api/me/setup`, issue #275); daqui
/// sai apenas o momento de provisionar. É o mesmo desenho do web, onde o
/// `authGuard` chama antes da primeira tela que depende desses recursos.
///
/// Sem isso, quem se cadastrava pelo app ficava sem geladeira — e o app não
/// oferece criação de geladeira, então a saída era abrir o site.
class SetupService {
  SetupService(this._api);

  final DinDinApi _api;

  String? _uid;
  Future<void>? _emAndamento;

  /// Provisiona uma vez por usuário, e **nunca** lança.
  ///
  /// Uma falha aqui não pode prender o app na tela de carregamento: quem já
  /// tem carteira segue usando o que estiver em cache, e a chamada é refeita
  /// na próxima abertura. Guardar o `Future` faz duas telas que peçam ao mesmo
  /// tempo esperarem o mesmo provisionamento, em vez de disparar dois.
  Future<void> garantirPadroes(String uid) {
    if (_uid != uid) {
      _uid = uid;
      _emAndamento = _api.provisionarPadroes().catchError((_) {});
    }
    return _emAndamento!;
  }
}
