import 'package:flutter/material.dart';

/// Raiz do aplicativo.
///
/// O esqueleto da issue #398 entrega só o que as próximas issues apoiam: o
/// tema e os componentes comuns chegam na #401, a autenticação na #400 e as
/// telas de dados na #402. Aqui ficam as decisões que valem para o app todo —
/// nome, locale e ausência da faixa de debug.
class DinDinApp extends StatelessWidget {
  const DinDinApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'DinDin',
      // O produto é brasileiro e formata valor, percentual e data em pt-BR.
      // Fixar o locale evita que o app siga o idioma do aparelho e exiba
      // ponto decimal onde o usuário espera vírgula.
      locale: Locale('pt', 'BR'),
      debugShowCheckedModeBanner: false,
      home: _Esqueleto(),
    );
  }
}

class _Esqueleto extends StatelessWidget {
  const _Esqueleto();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('DinDin')),
      body: const Center(child: Text('Em construção')),
    );
  }
}
