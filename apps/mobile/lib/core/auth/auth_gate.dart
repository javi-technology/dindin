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

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  String? _preparando;
  String? _preparado;

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
        if (sessao == null) return widget.login;
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
