import 'dart:io' show Platform;

import 'package:in_app_purchase/in_app_purchase.dart';

import 'loja_backend.dart';

/// Ids dos produtos, idênticos nas duas lojas e no backend
/// (`docs/publicacao-lojas.md`).
const produtosDeAssinatura = {'dindin_basic_monthly', 'dindin_basic_yearly'};

/// [LojaBackend] sobre o `in_app_purchase` (issue #405).
class InAppLojaBackend implements LojaBackend {
  InAppLojaBackend({InAppPurchase? sdk, String? plataforma})
    : _sdk = sdk ?? InAppPurchase.instance,
      _plataforma = plataforma ?? (Platform.isIOS ? 'apple' : 'google');

  final InAppPurchase _sdk;
  final String _plataforma;
  final _detalhes = <String, ProductDetails>{};

  @override
  String get plataforma => _plataforma;

  @override
  Future<bool> disponivel() => _sdk.isAvailable();

  @override
  Future<List<ProdutoDaLoja>> produtos() async {
    final resposta = await _sdk.queryProductDetails(produtosDeAssinatura);
    for (final d in resposta.productDetails) {
      _detalhes[d.id] = d;
    }
    final ordenados = resposta.productDetails.toList()
      ..sort((a, b) => a.rawPrice.compareTo(b.rawPrice));
    return [
      for (final d in ordenados)
        ProdutoDaLoja(id: d.id, titulo: d.title, preco: d.price),
    ];
  }

  @override
  Stream<CompraDaLoja> get compras =>
      _sdk.purchaseStream.expand((lista) => lista.map(_converter));

  CompraDaLoja _converter(PurchaseDetails compra) => CompraDaLoja(
    produtoId: compra.productID,
    credencial: compra.verificationData.serverVerificationData,
    estado: switch (compra.status) {
      PurchaseStatus.pending => EstadoDaCompra.pendente,
      PurchaseStatus.purchased => EstadoDaCompra.comprada,
      PurchaseStatus.restored => EstadoDaCompra.restaurada,
      PurchaseStatus.canceled => EstadoDaCompra.cancelada,
      PurchaseStatus.error => EstadoDaCompra.erro,
    },
    concluir: () async {
      if (compra.pendingCompletePurchase) {
        await _sdk.completePurchase(compra);
      }
    },
  );

  @override
  Future<void> comprar(String produtoId) async {
    final detalhes = _detalhes[produtoId];
    if (detalhes == null) {
      throw StateError('Produto $produtoId não carregado');
    }
    // Assinatura é "não consumível" para o plugin: a renovação é da loja.
    await _sdk.buyNonConsumable(
      purchaseParam: PurchaseParam(productDetails: detalhes),
    );
  }

  @override
  Future<void> restaurar() => _sdk.restorePurchases();
}
