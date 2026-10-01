import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'armazenamento_do_cache.dart';
import 'armazenamento_seguro.dart';

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

/// Último estado conhecido das consultas, no aparelho.
///
/// Uma lista que só aparece depois de a rede responder deixa o app
/// inutilizável no elevador ou no metrô — restrição que o web não tem.
///
/// O cache é **do usuário que o gravou** (issue #498): cada entrada leva o uid
/// na chave, e só o usuário vinculado lê e grava. Se a sessão termina por um
/// caminho que não é o botão de sair (token revogado, conta removida, 401 que
/// sobrevive à renovação), quem entrar depois no mesmo aparelho não vê a
/// carteira do anterior. E o conteúdo fica no armazenamento seguro do sistema,
/// não em texto puro.
class CacheLocal {
  CacheLocal._(this._armazenamento);

  static const _prefixo = 'dindin-cache:';

  final ArmazenamentoDoCache _armazenamento;

  /// Entradas do usuário vinculado, em memória: `ler` é síncrono porque a
  /// tela precisa do último estado no primeiro quadro, sem esperar o sistema.
  final Map<String, EntradaDeCache> _entradas = {};

  String? _dono;

  /// Usuário a quem o cache pertence agora, ou `null` sem sessão.
  String? get dono => _dono;

  /// Chave de uma entrada no armazenamento: o uid vai junto, e é ele que
  /// impede um usuário de ler o que outro gravou.
  static String chaveNoArmazenamento(String uid, String chave) =>
      '$_prefixo$uid:$chave';

  /// Abre o cache, sem usuário vinculado.
  ///
  /// Apaga o cache em texto puro que as versões anteriores deixaram nas
  /// preferências: trocar o destino sem apagá-lo deixaria a carteira legível
  /// no aparelho para sempre. A escolha de tema, que está nas mesmas
  /// preferências, não é tocada.
  static Future<CacheLocal> abrir({ArmazenamentoDoCache? armazenamento}) async {
    final cache = CacheLocal._(armazenamento ?? ArmazenamentoSeguro());
    await cache._apagarCacheEmTextoPuro();
    return cache;
  }

  Future<void> _apagarCacheEmTextoPuro() async {
    final prefs = await SharedPreferences.getInstance();
    for (final chave in prefs.getKeys().toList()) {
      if (chave.startsWith(_prefixo)) await prefs.remove(chave);
    }
  }

  /// Vincula o cache ao usuário da sessão, ou o desvincula (`null`) quando a
  /// sessão termina.
  ///
  /// Trocar de usuário apaga o que era do anterior; vincular o mesmo usuário
  /// mantém o cache. Sem vínculo o cache não lê nem grava.
  Future<void> vincularA(String? uid) async {
    if (uid != null && uid == _dono) return;

    _entradas.clear();
    _dono = uid;
    final meuPrefixo = uid == null ? null : '$_prefixo$uid:';

    try {
      final guardado = await _armazenamento.lerTudo();
      for (final par in guardado.entries) {
        if (!par.key.startsWith(_prefixo)) continue;

        if (meuPrefixo != null && par.key.startsWith(meuPrefixo)) {
          final entrada = _decodificar(par.value);
          if (entrada != null) {
            _entradas[par.key.substring(meuPrefixo.length)] = entrada;
          }
        } else {
          // Do usuário anterior, ou de qualquer um quando a sessão termina.
          await _armazenamento.remover(par.key);
        }
      }
    } catch (_) {
      // O cache é conveniência: se o sistema não o entrega, o app segue sem
      // ele e busca da rede.
    }
  }

  EntradaDeCache? ler(String chave) => _dono == null ? null : _entradas[chave];

  Future<void> gravar(String chave, Object? dados) async {
    final dono = _dono;
    if (dono == null) return;

    final gravadoEm = DateTime.now();
    final bruto = jsonEncode({
      'dados': dados,
      'gravadoEm': gravadoEm.toIso8601String(),
    });

    try {
      await _armazenamento.gravar(chaveNoArmazenamento(dono, chave), bruto);
    } catch (_) {
      // Perder a gravação custa uma espera na próxima abertura, não o app.
      return;
    }

    // O usuário pode ter mudado enquanto o sistema gravava: a entrada em
    // memória só vale para o dono que a pediu.
    if (_dono == dono) {
      _entradas[chave] = EntradaDeCache(
        dados: jsonDecode(jsonEncode(dados)),
        gravadoEm: gravadoEm,
      );
    }
  }

  /// Apaga o cache, e só ele.
  ///
  /// Chamado no logout: o dado é do usuário autenticado, e deixá-lo para trás
  /// mostraria a carteira de quem saiu para quem entrar depois no mesmo
  /// aparelho. A escolha de tema não é dado de usuário e permanece.
  Future<void> limpar() => _apagarTudo();

  Future<void> _apagarTudo() async {
    _entradas.clear();

    try {
      final guardado = await _armazenamento.lerTudo();
      for (final chave in guardado.keys) {
        if (chave.startsWith(_prefixo)) await _armazenamento.remover(chave);
      }
    } catch (_) {
      // Sem acesso ao armazenamento não há o que apagar daqui; a memória já
      // foi limpa e o próximo vínculo recomeça do que o sistema entregar.
    }
  }

  static EntradaDeCache? _decodificar(String bruto) {
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
}
