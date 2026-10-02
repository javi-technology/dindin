import 'dart:async';

import 'package:flutter/foundation.dart';

/// Código de contrato do 429 de rate limit. A IA também responde 429, com
/// texto próprio de negócio; o aviso global só vale para este código.
const String codigoLimiteDeRequisicoes = 'RATE_LIMITED';

/// Espera assumida quando o 429 não diz quanto: a janela do rate limit da API.
const int esperaPadraoEmSegundos = 60;

String mensagemDeLimite(int segundos) =>
    'Muitas requisições. Aguarde $segundos '
    '${segundos == 1 ? 'segundo' : 'segundos'} e tente de novo.';

/// Aviso global de rate limit (issue #505).
///
/// O limite vale para toda rota `/api/*`, então o 429 pode chegar em qualquer
/// tela; sem um aviso único, cada tela mostraria uma falha genérica ou nenhuma
/// explicação. O `ApiClient` o aciona e o [AvisoDeLimiteGate] o exibe.
class AvisoDeLimite extends ChangeNotifier {
  int? _segundos;
  Timer? _timer;

  /// Espera pedida pela API; `null` sem aviso.
  int? get segundos => _segundos;

  void avisar(int segundos) {
    _timer?.cancel();
    _segundos = segundos;
    _timer = Timer(Duration(seconds: segundos), dispensar);
    notifyListeners();
  }

  void dispensar() {
    _timer?.cancel();
    _timer = null;
    if (_segundos == null) return;
    _segundos = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
