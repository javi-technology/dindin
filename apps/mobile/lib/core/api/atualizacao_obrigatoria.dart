import 'package:flutter/foundation.dart';

/// Código de contrato com que a API recusa uma versão abaixo da mínima
/// (issue #500).
const String codigoAtualizacaoObrigatoria = 'APP_UPDATE_REQUIRED';

/// Estado "esta versão do app não é mais aceita pela API".
///
/// O `ApiClient` o aciona ao receber 426; quem escuta (o [AtualizacaoGate])
/// troca o app pela tela de atualização. Fica fora das telas porque a recusa
/// pode vir de qualquer requisição, e cada tela tratar a sua deixaria algumas
/// com erro genérico e o usuário sem saber o que fazer.
class AtualizacaoObrigatoria extends ChangeNotifier {
  bool _exigida = false;

  bool get exigida => _exigida;

  /// Passa a exigir a atualização. Idempotente: várias requisições falham de
  /// uma vez e só a primeira precisa avisar.
  void exigir() {
    if (_exigida) return;
    _exigida = true;
    notifyListeners();
  }
}
