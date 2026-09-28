import 'package:flutter/material.dart';

import 'sessao.dart';

/// Decide entre a tela de login e o app, pela sessão.
///
/// No celular a sessão expira com o app aberto, e o 401 que vem daí precisa
/// levar ao login sem deixar a tela anterior montada por baixo: o widget
/// troca a subárvore inteira, em vez de empilhar uma rota sobre o que estava.
class AuthGate extends StatelessWidget {
  const AuthGate({
    super.key,
    required this.sessoes,
    required this.login,
    required this.autenticado,
  });

  final Stream<Sessao?> sessoes;
  final Widget login;
  final Widget autenticado;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Sessao?>(
      stream: sessoes,
      builder: (context, snapshot) {
        // Antes da primeira emissão não se sabe se há sessão restaurada;
        // mostrar o login aqui faria a tela piscar a cada abertura do app.
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        return snapshot.data == null ? login : autenticado;
      },
    );
  }
}
