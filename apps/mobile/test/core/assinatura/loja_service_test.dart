import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/api/api_exception.dart';
import 'package:dindin_mobile/core/assinatura/loja_backend.dart';
import 'package:dindin_mobile/core/assinatura/loja_service.dart';

// ---------------------------------------------------------------------------
// Compra in-app (issue #405).
//
// O app nunca concede acesso por conta própria: ele repassa o recibo ao
// backend e só conclui a compra na loja depois que o backend validou. Se
// concluísse antes e o envio falhasse, a loja consideraria a compra entregue
// e o usuário pagaria sem receber.
// ---------------------------------------------------------------------------

class _LojaFalsa implements LojaBackend {
  bool loja = true;
  final compras$ = StreamController<CompraDaLoja>.broadcast();
  final comprados = <String>[];
  int restauracoes = 0;

  @override
  String get plataforma => 'apple';

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
  Stream<CompraDaLoja> get compras => compras$.stream;

  @override
  Future<void> comprar(String produtoId) async => comprados.add(produtoId);

  @override
  Future<void> restaurar() async => restauracoes += 1;
}

CompraDaLoja _compra(
  EstadoDaCompra estado, {
  required List<String> concluidas,
  String produto = 'dindin_basic_monthly',
}) => CompraDaLoja(
  produtoId: produto,
  credencial: 'recibo-1',
  estado: estado,
  concluir: () async => concluidas.add(produto),
);

void main() {
  late _LojaFalsa loja;
  late List<StorePurchaseRequest> enviados;
  late int recargas;
  late Object? falha;
  late List<String> concluidas;
  late LojaService service;

  setUp(() {
    loja = _LojaFalsa();
    enviados = [];
    recargas = 0;
    falha = null;
    concluidas = [];
    service = LojaService(
      backend: loja,
      registrar: (pedido) async {
        enviados.add(pedido);
        if (falha != null) throw falha!;
      },
      recarregar: () async => recargas += 1,
    );
  });

  tearDown(() async {
    service.dispose();
    await loja.compras$.close();
  });

  Future<void> chega(CompraDaLoja compra) async {
    loja.compras$.add(compra);
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }

  test('carrega os produtos com o preço que a loja informa', () async {
    await service.iniciar();

    expect(service.disponivel, isTrue);
    expect(service.produtos.map((p) => p.preco), contains('R\$ 19,90'));
  });

  test('sem loja disponível, não oferece a compra', () async {
    loja.loja = false;
    await service.iniciar();

    expect(service.disponivel, isFalse);
    await service.comprar('dindin_basic_monthly');
    expect(loja.comprados, isEmpty);
  });

  test('comprar abre o fluxo da loja com o produto escolhido', () async {
    await service.iniciar();
    await service.comprar('dindin_basic_yearly');

    expect(loja.comprados, ['dindin_basic_yearly']);
  });

  test('envia o recibo ao backend e só conclui a compra depois dele', () async {
    await service.iniciar();
    await chega(_compra(EstadoDaCompra.comprada, concluidas: concluidas));

    expect(enviados.single.platform, 'apple');
    expect(enviados.single.productId, 'dindin_basic_monthly');
    expect(enviados.single.credential, 'recibo-1');
    expect(concluidas, ['dindin_basic_monthly']);
    expect(recargas, 1, reason: 'o acesso vem do perfil, não do app');
    expect(service.erro, isNull);
  });

  test('se o backend falhar, NÃO conclui a compra: a loja reentrega', () async {
    falha = const NetworkException();
    await service.iniciar();
    await chega(_compra(EstadoDaCompra.comprada, concluidas: concluidas));

    expect(concluidas, isEmpty);
    expect(service.erro, isNotNull);
    expect(recargas, 0);
  });

  test('recibo recusado vira mensagem em português, sem concluir', () async {
    falha = const ApiException(
      statusCode: 400,
      message: 'Recibo inválido',
      code: 'INVALID_RECEIPT',
    );
    await service.iniciar();
    await chega(_compra(EstadoDaCompra.comprada, concluidas: concluidas));

    expect(service.erro, contains('não foi possível confirmar'));
    expect(concluidas, isEmpty);
  });

  // Concluir encerra a reentrega da loja sem resolver a cobrança: o usuário
  // pagaria duas vezes ou pagaria sem acesso, e o app pararia de lembrar.
  test(
    'já assinante: recarrega o acesso, NÃO conclui e orienta o suporte',
    () async {
      falha = const ApiException(
        statusCode: 409,
        message: 'Assinatura já ativa',
        code: 'ALREADY_SUBSCRIBED',
      );
      await service.iniciar();
      await chega(_compra(EstadoDaCompra.comprada, concluidas: concluidas));

      expect(service.erro, contains('já tem uma assinatura'));
      expect(service.erro, contains('suporte'));
      expect(concluidas, isEmpty);
      expect(recargas, 1);
    },
  );

  test('recibo de outra conta: NÃO conclui e orienta o suporte', () async {
    falha = const ApiException(
      statusCode: 409,
      message: 'vinculada',
      code: 'RECEIPT_ALREADY_USED',
    );
    await service.iniciar();
    await chega(_compra(EstadoDaCompra.comprada, concluidas: concluidas));

    expect(service.erro, contains('outra conta'));
    expect(service.erro, contains('suporte'));
    expect(concluidas, isEmpty);
  });

  test(
    'restaurar pede à loja e trata a compra restaurada como uma compra',
    () async {
      await service.iniciar();
      await service.restaurar();
      await chega(_compra(EstadoDaCompra.restaurada, concluidas: concluidas));

      expect(loja.restauracoes, 1);
      expect(enviados, hasLength(1));
      expect(recargas, 1);
    },
  );

  test('cancelar na loja não é erro', () async {
    await service.iniciar();
    await chega(_compra(EstadoDaCompra.cancelada, concluidas: concluidas));

    expect(service.erro, isNull);
    expect(enviados, isEmpty);
    expect(service.processando, isFalse);
  });

  test('erro da loja mostra mensagem e não envia nada', () async {
    await service.iniciar();
    await chega(_compra(EstadoDaCompra.erro, concluidas: concluidas));

    expect(service.erro, isNotNull);
    expect(enviados, isEmpty);
  });

  test('compra pendente mantém o estado de processamento', () async {
    await service.iniciar();
    await chega(_compra(EstadoDaCompra.pendente, concluidas: concluidas));

    expect(service.processando, isTrue);
    expect(enviados, isEmpty);
  });

  test('toque duplo em comprar não abre duas compras', () async {
    await service.iniciar();
    final a = service.comprar('dindin_basic_monthly');
    final b = service.comprar('dindin_basic_monthly');
    await Future.wait([a, b]);

    expect(loja.comprados, hasLength(1));
  });
}
