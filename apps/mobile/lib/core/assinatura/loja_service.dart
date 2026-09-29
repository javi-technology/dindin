import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../contracts/contracts.g.dart';
import '../api/api_exception.dart';
import 'loja_backend.dart';

/// Compra da assinatura dentro do app (issue #405).
///
/// O acesso **nunca** é concedido aqui. O serviço repassa o recibo ao
/// backend e recarrega o perfil: quem libera o recurso é o entitlement
/// gravado depois da validação com a loja, o mesmo que a web usa.
class LojaService extends ChangeNotifier {
  LojaService({
    required this._backend,
    required this._registrar,
    required this._recarregar,
  });

  final LojaBackend _backend;
  final Future<void> Function(StorePurchaseRequest) _registrar;
  final Future<void> Function() _recarregar;

  StreamSubscription<CompraDaLoja>? _assinatura;
  Future<void> _fila = Future.value();

  bool _disponivel = false;
  bool _processando = false;
  String? _erro;
  List<ProdutoDaLoja> _produtos = const [];

  bool get disponivel => _disponivel;
  List<ProdutoDaLoja> get produtos => _produtos;

  /// Há compra em andamento: o botão fica indisponível, porque tocar de novo
  /// com a resposta demorando é o comportamento normal no celular.
  bool get processando => _processando;

  /// Mensagem pronta para a tela, em português.
  String? get erro => _erro;

  Future<void> iniciar() async {
    // Escuta antes de perguntar à loja: compras pendentes de uma sessão
    // anterior chegam assim que o stream tem ouvinte.
    _assinatura ??= _backend.compras.listen(
      (compra) => _fila = _fila.then((_) => _tratar(compra)),
    );

    try {
      _disponivel = await _backend.disponivel();
      _produtos = _disponivel ? await _backend.produtos() : const [];
    } catch (_) {
      _disponivel = false;
      _produtos = const [];
    }
    notifyListeners();
  }

  Future<void> comprar(String produtoId) async {
    if (!_disponivel || _processando) return;

    _processando = true;
    _erro = null;
    notifyListeners();

    try {
      await _backend.comprar(produtoId);
    } catch (_) {
      _erro = 'Não foi possível abrir a compra. Tente de novo.';
      _processando = false;
      notifyListeners();
    }
  }

  Future<void> restaurar() async {
    if (!_disponivel || _processando) return;

    _processando = true;
    _erro = null;
    notifyListeners();

    try {
      await _backend.restaurar();
    } catch (_) {
      _erro = 'Não foi possível restaurar as compras. Tente de novo.';
    }
    // Sem compra a restaurar a loja não emite nada: sem isto o botão
    // ficaria indisponível para sempre.
    _processando = false;
    notifyListeners();
  }

  Future<void> _tratar(CompraDaLoja compra) async {
    switch (compra.estado) {
      case EstadoDaCompra.pendente:
        _processando = true;
      case EstadoDaCompra.cancelada:
        _processando = false;
      case EstadoDaCompra.erro:
        _processando = false;
        _erro = 'A loja não conseguiu concluir a compra. Tente de novo.';
      case EstadoDaCompra.comprada:
      case EstadoDaCompra.restaurada:
        await _confirmar(compra);
        return;
    }
    notifyListeners();
  }

  Future<void> _confirmar(CompraDaLoja compra) async {
    _processando = true;
    _erro = null;
    notifyListeners();

    try {
      await _registrar(
        StorePurchaseRequest(
          platform: _backend.plataforma,
          productId: compra.produtoId,
          credential: compra.credencial,
        ),
      );
      await compra.concluir();
      await _recarregar();
    } on ApiException catch (falha) {
      await _tratarRecusa(compra, falha);
    } on NetworkException catch (falha) {
      // Sem concluir: a loja reentrega a compra na próxima abertura, e é
      // isso que impede o usuário de pagar sem receber.
      _erro =
          '${falha.message} A compra será confirmada quando você '
          'reabrir o app.';
    } catch (_) {
      _erro =
          'Não foi possível confirmar a compra. Ela será tentada de novo '
          'ao reabrir o app.';
    } finally {
      _processando = false;
      notifyListeners();
    }
  }

  Future<void> _tratarRecusa(CompraDaLoja compra, ApiException falha) async {
    switch (falha.code) {
      case 'ALREADY_SUBSCRIBED':
        // O acesso já existe; concluir evita a loja reentregar para sempre.
        await compra.concluir();
        await _recarregar();
        _erro =
            'Você já tem uma assinatura ativa. Confira em Assinatura se '
            'a cobrança da loja não é duplicada.';
      case 'RECEIPT_ALREADY_USED':
        await compra.concluir();
        _erro = 'Esta compra já está vinculada a outra conta.';
      case 'INVALID_RECEIPT':
        _erro =
            'Sua compra foi feita, mas não foi possível confirmar com a '
            'loja. Tente restaurar as compras.';
      default:
        _erro =
            'Não foi possível confirmar a compra. Ela será tentada de '
            'novo ao reabrir o app.';
    }
  }

  @override
  void dispose() {
    _assinatura?.cancel();
    super.dispose();
  }
}
