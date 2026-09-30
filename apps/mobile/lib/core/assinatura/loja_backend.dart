/// Produto de assinatura como a loja o vende, com o preço já formatado na
/// moeda e no país do usuário — formatar por conta própria contradiria a
/// cobrança que a loja vai fazer.
class ProdutoDaLoja {
  const ProdutoDaLoja({
    required this.id,
    required this.titulo,
    required this.preco,
  });

  final String id;
  final String titulo;
  final String preco;
}

enum EstadoDaCompra { pendente, comprada, restaurada, cancelada, erro }

/// Compra entregue pela loja (issue #405).
class CompraDaLoja {
  const CompraDaLoja({
    required this.produtoId,
    required this.credencial,
    required this.estado,
    required this.concluir,
  });

  final String produtoId;

  /// Recibo da App Store ou `purchaseToken` do Google Play. Vai ao backend,
  /// que o valida com a loja; nunca é logado.
  final String credencial;
  final EstadoDaCompra estado;

  /// Avisa a loja de que a compra foi entregue. Só se chama **depois** de o
  /// backend validar: concluir antes faria a loja dar a compra por entregue
  /// mesmo que o acesso não tenha sido concedido.
  final Future<void> Function() concluir;
}

/// Fronteira entre o app e o SDK de compra in-app (issue #405).
///
/// Toda conversa com a loja passa por aqui, como em `AuthBackend`: é o que
/// permite testar o fluxo de compra sem loja, sem conta e sem aparelho.
abstract class LojaBackend {
  /// `apple` ou `google`, como o backend nomeia as lojas.
  String get plataforma;

  Future<bool> disponivel();

  Future<List<ProdutoDaLoja>> produtos();

  /// Compras entregues pela loja, inclusive as pendentes de uma sessão
  /// anterior que o app não chegou a concluir.
  Stream<CompraDaLoja> get compras;

  Future<void> comprar(String produtoId);

  /// Pede à loja as compras já feitas na conta, para aparelho novo.
  Future<void> restaurar();
}
