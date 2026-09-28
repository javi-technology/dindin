import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// O que o cache devolve: o dado e **quando** ele foi gravado.
///
/// A data não é detalhe: sem ela a tela não teria como avisar que o número na
/// frente do usuário pode estar velho, e ele decidiria uma compra sobre uma
/// cotação de ontem achando que é a de agora.
class EntradaDeCache {
  const EntradaDeCache({required this.dados, required this.gravadoEm});

  final dynamic dados;
  final DateTime gravadoEm;
}

/// Último estado conhecido das consultas, no disco do aparelho.
///
/// Uma lista que só aparece depois de a rede responder deixa o app
/// inutilizável no elevador ou no metrô — restrição que o web não tem.
class CacheLocal {
  CacheLocal._(this._prefs);

  static const _prefixo = 'dindin-cache:';

  final SharedPreferences _prefs;

  static Future<CacheLocal> abrir() async =>
      CacheLocal._(await SharedPreferences.getInstance());

  EntradaDeCache? ler(String chave) {
    final bruto = _prefs.getString('$_prefixo$chave');
    if (bruto == null) return null;

    try {
      final json = jsonDecode(bruto) as Map<String, dynamic>;

      return EntradaDeCache(
        dados: json['dados'],
        gravadoEm: DateTime.parse(json['gravadoEm'] as String),
      );
    } catch (_) {
      // Entrada corrompida é descartada em silêncio: o cache é conveniência,
      // e perdê-lo custa uma espera, não o acesso ao app.
      return null;
    }
  }

  Future<void> gravar(String chave, Object? dados) => _prefs.setString(
    '$_prefixo$chave',
    jsonEncode({'dados': dados, 'gravadoEm': DateTime.now().toIso8601String()}),
  );

  /// Apaga o cache, e só ele.
  ///
  /// Chamado no logout: o dado é do usuário autenticado, e deixá-lo para trás
  /// mostraria a carteira de quem saiu para quem entrar depois no mesmo
  /// aparelho. A escolha de tema não é dado de usuário e permanece.
  Future<void> limpar() async {
    for (final chave in _prefs.getKeys().toList()) {
      if (chave.startsWith(_prefixo)) await _prefs.remove(chave);
    }
  }
}
