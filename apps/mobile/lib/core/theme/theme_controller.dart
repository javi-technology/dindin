import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Escolha de tema do usuário, preservada entre aberturas (issue #401).
///
/// São **três** estados, não um interruptor de duas posições: com dois não
/// haveria como voltar a seguir o sistema depois de escolher. Seguir o
/// sistema é a ausência de escolha, e por isso não guarda valor — gravar
/// `system` faria o app ignorar a mudança de preferência do aparelho.
class ThemeController extends ChangeNotifier {
  ThemeController._(this._prefs, this._modo);

  static const chave = 'dindin-theme';

  final SharedPreferences _prefs;
  ThemeMode _modo;

  ThemeMode get modo => _modo;

  static Future<ThemeController> carregar() async {
    final prefs = await SharedPreferences.getInstance();

    return ThemeController._(prefs, _lerModo(prefs.getString(chave)));
  }

  /// Valor guardado fora do esperado cai no padrão em vez de quebrar a
  /// abertura: o app não sobe por causa de uma preferência corrompida.
  static ThemeMode _lerModo(String? guardado) => switch (guardado) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  Future<void> definir(ThemeMode modo) async {
    if (modo == _modo) return;

    _modo = modo;

    if (modo == ThemeMode.system) {
      await _prefs.remove(chave);
    } else {
      await _prefs.setString(chave, modo == ThemeMode.dark ? 'dark' : 'light');
    }

    notifyListeners();
  }
}
