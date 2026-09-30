import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'notificacoes_backend.dart';

/// Notificações push do alerta de preço-alvo (issue #408).
///
/// O alerta avisa que um ativo chegou ao preço-alvo de compra: chegar tarde
/// reduz o valor do aviso, e é por isso que push se justifica sobre o e-mail
/// que o usuário lê horas depois.
///
/// A permissão é pedida num momento com contexto — na geladeira, onde o
/// alerta acontece —, e não na primeira abertura. Negar é escolha do usuário:
/// o e-mail continua sendo o canal, e a tela não mostra erro.
class NotificacoesService extends ChangeNotifier {
  NotificacoesService._(
    this._prefs,
    this._backend,
    this._registrar,
    this._remover,
    this._permissao,
    this._desligadoPeloUsuario,
  ) {
    _assinatura = _backend.tokensRenovados.listen(_aoRenovarToken);
  }

  static const chavePerguntou = 'dindin-push-perguntou';
  static const chaveDesligado = 'dindin-push-desligado';

  final SharedPreferences _prefs;
  final NotificacoesBackend _backend;
  final Future<void> Function(String token, String plataforma) _registrar;
  final Future<void> Function(String token) _remover;

  late final StreamSubscription<String> _assinatura;

  PermissaoDeNotificacao _permissao;
  bool _desligadoPeloUsuario;
  String? _tokenRegistrado;
  String? _erro;

  PermissaoDeNotificacao get permissao => _permissao;

  bool get jaPerguntou => _prefs.getBool(chavePerguntou) ?? false;

  /// Se o app está de fato recebendo push agora.
  bool get ativas =>
      _permissao == PermissaoDeNotificacao.concedida &&
      !_desligadoPeloUsuario &&
      _tokenRegistrado != null;

  /// Falha ao falar com o backend. **Não** cobre a permissão negada.
  String? get erro => _erro;

  static Future<NotificacoesService> carregar({
    required NotificacoesBackend backend,
    required Future<void> Function(String, String) registrarToken,
    required Future<void> Function(String) removerToken,
  }) async {
    final prefs = await SharedPreferences.getInstance();

    final service = NotificacoesService._(
      prefs,
      backend,
      registrarToken,
      removerToken,
      await backend.permissaoAtual(),
      prefs.getBool(chaveDesligado) ?? false,
    );

    // O token muda quando o usuário reinstala o app, troca de aparelho ou
    // limpa os dados — e isso acontece com o app fechado. Registrando só ao
    // conceder a permissão, o token novo nunca chegaria à API e o push
    // pararia em silêncio. O backend atualiza o registro existente, então
    // repetir a cada abertura não duplica aparelho.
    await service._registrarSeJaAutorizado();

    return service;
  }

  Future<void> _registrarSeJaAutorizado() async {
    if (_permissao != PermissaoDeNotificacao.concedida) return;
    // Quem desligou dentro do app continua desligado: registrar de novo faria
    // o push voltar sozinho, sem o usuário pedir.
    if (_desligadoPeloUsuario) return;

    await _registrarTokenAtual();
  }

  /// Pede a permissão, uma vez só.
  ///
  /// Perguntar de novo depois da negativa não reabre a folha do sistema — as
  /// duas plataformas a mostram uma vez — e ainda incomoda, então o app lembra
  /// que já perguntou.
  Future<void> pedirPermissao() async {
    if (jaPerguntou) return;

    await _prefs.setBool(chavePerguntou, true);
    _permissao = await _backend.pedirPermissao();

    if (_permissao == PermissaoDeNotificacao.concedida) {
      await _registrarTokenAtual();
    }

    notifyListeners();
  }

  /// Religa depois de o usuário ter desligado dentro do app.
  Future<void> ligar() async {
    _desligadoPeloUsuario = false;
    await _prefs.remove(chaveDesligado);

    if (_permissao != PermissaoDeNotificacao.concedida) {
      _permissao = await _backend.pedirPermissao();
    }

    if (_permissao == PermissaoDeNotificacao.concedida) {
      await _registrarTokenAtual();
    }

    notifyListeners();
  }

  /// Desliga as notificações **dentro do app**, sem depender das
  /// configurações do sistema.
  Future<void> desligar() async {
    _desligadoPeloUsuario = true;
    await _prefs.setBool(chaveDesligado, true);

    final token = _tokenRegistrado;
    if (token != null) {
      try {
        await _remover(token);
      } catch (erro) {
        // Não conseguir avisar o backend não pode impedir o usuário de
        // desligar: o token inválido é descartado no primeiro envio que
        // falhar.
        _erro = 'Não foi possível avisar o servidor. Tente de novo.';
      }
    }

    await _backend.apagarToken();
    _tokenRegistrado = null;
    notifyListeners();
  }

  Future<void> _registrarTokenAtual({String? token}) async {
    if (_desligadoPeloUsuario) return;

    try {
      token ??= await _backend.token();
      // Sem token não há o que registrar — e o e-mail cobre o usuário.
      if (token == null) return;
      // O mesmo token já registrado nesta sessão não volta à API: a abertura
      // do app já o envia, e conceder a permissão em seguida repetiria a
      // chamada sem nada de novo para contar.
      if (token == _tokenRegistrado) return;

      await _registrar(token, _backend.plataforma);
      _tokenRegistrado = token;
      _erro = null;
    } catch (erro) {
      // Push é um canal a mais: falhar ao registrar não derruba o app nem
      // interrompe o que o usuário estava fazendo.
      _erro = 'Não foi possível ativar as notificações. Tente de novo.';
    }
  }

  /// O token renovado vem pelo stream e é usado como está.
  ///
  /// Reler do backend aqui devolveria o token antigo, porque a renovação é
  /// justamente o aviso de que ele mudou.
  Future<void> _aoRenovarToken(String token) async {
    if (_permissao != PermissaoDeNotificacao.concedida) return;

    await _registrarTokenAtual(token: token);
    notifyListeners();
  }

  @override
  void dispose() {
    _assinatura.cancel();
    super.dispose();
  }
}
