import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/assinatura/loja_backend.dart';
import 'package:dindin_mobile/core/assinatura/loja_service.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/assinatura/planos_da_loja.dart';

// ---------------------------------------------------------------------------
// Tela de planos da compra in-app (issue #405).
// ---------------------------------------------------------------------------

class _Loja implements LojaBackend {
  bool loja = true;
  final comprados = <String>[];
  int restauracoes = 0;
  final _compras = StreamController<CompraDaLoja>.broadcast();

  @override
  String get plataforma => 'google';
  @override
  Future<bool> disponivel() async => loja;
  @override
  Future<List<ProdutoDaLoja>> produtos() async => const [
    ProdutoDaLoja(
      id: 'dindin_basic_monthly',
      titulo: 'Mensal',
      preco: 'R\$ 19,90',
    ),
    ProdutoDaLoja(
      id: 'dindin_basic_yearly',
      titulo: 'Anual',
      preco: 'R\$ 199,00',
    ),
  ];
  @override
  Stream<CompraDaLoja> get compras => _compras.stream;
  @override
  Future<void> comprar(String produtoId) async => comprados.add(produtoId);
  @override
  Future<void> restaurar() async => restauracoes += 1;
}

void main() {
  late _Loja backend;
  late LojaService service;

  setUp(() async {
    backend = _Loja();
    service = LojaService(
      backend: backend,
      registrar: (_) async {},
      recarregar: () async {},
    );
    await service.iniciar();
  });

  tearDown(() => service.dispose());

  Widget tela() => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: PlanosDaLoja(loja: service)),
  );

  testWidgets('mostra cada plano com o preço da loja', (tester) async {
    await tester.pumpWidget(tela());

    expect(find.text('R\$ 19,90'), findsOneWidget);
    expect(find.text('R\$ 199,00'), findsOneWidget);
  });

  testWidgets('tocar em assinar abre a compra do plano escolhido', (
    tester,
  ) async {
    await tester.pumpWidget(tela());
    await tester.tap(find.byKey(const Key('assinar-dindin_basic_yearly')));
    await tester.pump();

    expect(backend.comprados, ['dindin_basic_yearly']);
  });

  testWidgets('com a compra em andamento, os botões ficam indisponíveis', (
    tester,
  ) async {
    await tester.pumpWidget(tela());
    await tester.tap(find.byKey(const Key('assinar-dindin_basic_monthly')));
    await tester.pump();

    final botao = tester.widget<FilledButton>(
      find.byKey(const Key('assinar-dindin_basic_yearly')),
    );
    expect(botao.onPressed, isNull);
  });

  testWidgets('oferece restaurar as compras', (tester) async {
    await tester.pumpWidget(tela());
    await tester.tap(find.byKey(const Key('restaurar-compras')));
    await tester.pump();

    expect(backend.restauracoes, 1);
  });

  testWidgets('explica a renovação automática e onde cancelar', (tester) async {
    await tester.pumpWidget(tela());

    expect(find.textContaining('renova automaticamente'), findsOneWidget);
    expect(find.textContaining('cancele'), findsOneWidget);
  });

  testWidgets('sem loja disponível, indica assinar pelo site', (tester) async {
    backend.loja = false;
    await service.iniciar();
    await tester.pumpWidget(tela());

    expect(find.byKey(const Key('assinar-dindin_basic_monthly')), findsNothing);
    expect(find.textContaining('pelo site'), findsOneWidget);
  });
}
