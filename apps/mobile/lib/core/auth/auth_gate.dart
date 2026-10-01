import 'package:flutter/material.dart';

import 'sessao.dart';

/// Decide entre a tela de login e o app, pela sessão.
///
/// No celular a sessão expira com o app aberto, e o 401 que vem daí precisa
/// levar ao login sem deixar a tela anterior montada por baixo: o widget
/// troca a subárvore inteira, em vez de empilhar uma rota sobre o que estava.
class AuthGate extends StatefulWidget {
  const AuthGate({
    super.key,
    required this.sessoes,
    required this.login,
    required this.autenticado,
    this.aoAutenticar,
    this.aoEncerrar,
  });

  final Stream<Sessao?> sessoes;
  final Widget login;
  final Widget autenticado;

  /// Trabalho que precisa terminar antes da primeira tela autenticada — hoje,
  /// provisionar carteira e geladeira padrão (#440).
  ///
  /// É aqui, e não na tela inicial, pelo mesmo motivo do web: a tela carrega
  /// as geladeiras assim que monta e leria a lista vazia, levando o usuário ao
  /// beco de "crie uma geladeira" com o provisionamento ainda a caminho.
  final Future<void> Function(Sessao sessao)? aoAutenticar;

  /// Trabalho de quando a sessão termina, por qualquer caminho: hoje, apagar o
  /// cache do usuário que saiu (issue #498).
  ///
  /// No celular a sessão acaba sem o botão de sair — token revogado, conta
  /// removida, 401 que sobrevive à renovação —, e é aqui, e não no botão, que
  /// o que era do usuário precisa ir embora. Também roda quando o app abre sem
  /// sessão, caso do token revogado com o app fechado.
  final Future<void> Function()? aoEncerrar;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  String? _preparando;
  String? _preparado;
  bool _encerrada = false;

  void _encerrar() {
    if (_encerrada) return;
    _encerrada = true;

    // Quem voltar a entrar, mesmo o mesmo usuário, precisa ser preparado de
    // novo: o que o encerramento apagou (o cache) não volta sozinho.
    _preparando = null;
    _preparado = null;

    // Uma falha aqui não pode prender o login: o cache é conveniência.
    widget.aoEncerrar?.call().catchError((_) {});
  }

  void _prepararPara(Sessao sessao) {
    if (_preparando == sessao.uid) return;
    _preparando = sessao.uid;

    // A falha não pode prender o app na tela de carregamento: o serviço já a
    // absorve, e o `catchError` cobre também quem passar outro callback.
    widget.aoAutenticar!(sessao).catchError((_) {}).whenComplete(() {
      if (!mounted) return;
      setState(() => _preparado = sessao.uid);
    });
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Sessao?>(
      stream: widget.sessoes,
      builder: (context, snapshot) {
        // Antes da primeira emissão não se sabe se há sessão restaurada;
        // mostrar o login aqui faria a tela piscar a cada abertura do app.
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const _Carregando();
        }

        final sessao = snapshot.data;
        if (sessao == null) {
          _encerrar();
          return widget.login;
        }
        _encerrada = false;
        if (widget.aoAutenticar == null) return widget.autenticado;

        _prepararPara(sessao);
        return _preparado == sessao.uid
            ? widget.autenticado
            : const _Carregando();
      },
    );
  }
}

class _Carregando extends StatelessWidget {
  const _Carregando();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
