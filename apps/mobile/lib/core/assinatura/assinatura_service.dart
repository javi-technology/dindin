import 'package:flutter/foundation.dart';

import '../../contracts/contracts.g.dart';
import '../data/dindin_api.dart';

/// Status da assinatura do usuário (issue #442).
///
/// O app tratava todo mundo como não assinante, e quem já paga pela web abria
/// o app e via o recurso bloqueado. A compra dentro do app é outro assunto
/// (#405) e depende de conta de loja; reconhecer quem já assina não depende
/// de nada disso.
class AssinaturaService extends ChangeNotifier {
  AssinaturaService(this._api);

  final DinDinApi _api;

  MeResponse? _perfil;

  /// Acesso às projeções, que é o que libera a simulação por ativo.
  ///
  /// Começa em `false` e só sobe com a resposta em mãos: liberar no otimismo
  /// faria a API devolver 402 e o usuário veria um erro cru no lugar da
  /// explicação sobre a assinatura.
  bool get temProjecoes =>
      _perfil?.entitlements.contains(Entitlement.projections) ?? false;

  /// Se o usuário é administrador, como o web também deriva de `/api/me`.
  bool get admin => _perfil?.admin ?? false;

  /// Lê o perfil. **Nunca lança**: sem rede o app segue utilizável, apenas
  /// sem liberar o que é pago.
  Future<void> carregar() async {
    try {
      _perfil = await _api.perfil();
    } catch (_) {
      // Mantém o estado anterior: uma falha não pode revogar o acesso de quem
      // já foi reconhecido nesta sessão.
    }
    notifyListeners();
  }
}
