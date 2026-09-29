import 'dart:async';

import 'package:dindin_mobile/core/auth/auth_backend.dart';
import 'package:dindin_mobile/core/auth/sessao.dart';

/// [AuthBackend] de teste.
///
/// Fica fora do arquivo de teste porque o teste do app também precisa dele:
/// duas cópias divergiriam na primeira mudança da interface, e só uma das
/// suítes acusaria.
class AuthBackendFalso implements AuthBackend {
  AuthBackendFalso({Sessao? inicial}) {
    _controller = StreamController<Sessao?>.broadcast(
      onListen: () => _controller.add(inicial),
    );
    _atual = inicial;
  }

  late final StreamController<Sessao?> _controller;
  Sessao? _atual;

  Object? erroAoEntrar;
  int entradasComEmail = 0;
  int entradasComGoogle = 0;
  int saidas = 0;
  final List<bool> renovacoes = [];
  String token = 'token-1';

  @override
  Stream<Sessao?> get sessoes => _controller.stream;

  @override
  Sessao? get sessaoAtual => _atual;

  void _entrar(Sessao sessao) {
    _atual = sessao;
    _controller.add(sessao);
  }

  @override
  Future<void> entrarComEmail(String email, String senha) async {
    entradasComEmail++;
    if (erroAoEntrar != null) throw erroAoEntrar!;
    _entrar(const Sessao(uid: 'u1', email: 'a@b.c'));
  }

  @override
  Future<void> cadastrarComEmail(String email, String senha) async {
    if (erroAoEntrar != null) throw erroAoEntrar!;
    _entrar(const Sessao(uid: 'u1', email: 'a@b.c'));
  }

  @override
  Future<void> entrarComGoogle() async {
    entradasComGoogle++;
    if (erroAoEntrar != null) throw erroAoEntrar!;
    _entrar(const Sessao(uid: 'u2', email: 'g@b.c'));
  }

  @override
  Future<void> sair() async {
    saidas++;
    _atual = null;
    _controller.add(null);
  }

  @override
  Future<String?> idToken({bool forceRefresh = false}) async {
    renovacoes.add(forceRefresh);
    return _atual == null ? null : token;
  }
}
