import 'package:flutter/foundation.dart';

import '../api/api_exception.dart';
import 'cache_local.dart';

/// Estado de uma consulta, como a tela precisa vê-lo.
@immutable
class EstadoDoRecurso<T> {
  const EstadoDoRecurso({
    this.dados,
    this.carregando = false,
    this.erro,
    this.doCache = false,
    this.atualizadoEm,
  });

  final T? dados;
  final bool carregando;

  /// Mensagem já pronta para a tela, em português.
  final String? erro;

  /// O que está em [dados] veio do disco e pode estar desatualizado.
  final bool doCache;

  /// Quando o dado exibido foi obtido.
  final DateTime? atualizadoEm;

  bool get vazio => dados == null && !carregando && erro == null;
}

/// Uma consulta à API com cache local e estados de tela (issue #402).
///
/// A abertura mostra o último estado conhecido enquanto busca o atual, e diz
/// que aquilo veio do cache: sem o aviso, o usuário tomaria decisão
/// financeira sobre um número velho achando que é o de agora.
class Recurso<T> extends ChangeNotifier {
  Recurso({
    required this.chave,
    required CacheLocal cache,
    required Future<T> Function() buscar,
    required Object? Function(T) serializar,
    required T Function(dynamic) desserializar,
  }) : _cache = cache,
       _buscar = buscar,
       _serializar = serializar,
       _desserializar = desserializar;

  final String chave;
  final CacheLocal _cache;
  final Future<T> Function() _buscar;
  final Object? Function(T) _serializar;
  final T Function(dynamic) _desserializar;

  EstadoDoRecurso<T> _estado = const EstadoDoRecurso(carregando: true);

  EstadoDoRecurso<T> get estado => _estado;

  void _publicar(EstadoDoRecurso<T> novo) {
    _estado = novo;
    notifyListeners();
  }

  Future<void> carregar() async {
    final doDisco = _lerDoCache();

    _publicar(
      EstadoDoRecurso(
        dados: doDisco?.$1 ?? _estado.dados,
        carregando: true,
        doCache: doDisco != null,
        atualizadoEm: doDisco?.$2,
      ),
    );

    try {
      final dados = await _buscar();
      await _cache.gravar(chave, _serializar(dados));

      _publicar(EstadoDoRecurso(dados: dados, atualizadoEm: DateTime.now()));
    } catch (erro) {
      // Com cache em mãos, a falha não apaga o que está na tela: mostrar o
      // número antigo, marcado como antigo, vale mais do que uma tela de erro
      // — é o caso do metrô, e no celular ele é rotina.
      _publicar(
        EstadoDoRecurso(
          dados: doDisco?.$1,
          erro: _mensagem(erro),
          doCache: doDisco != null,
          atualizadoEm: doDisco?.$2,
        ),
      );
    }
  }

  (T, DateTime)? _lerDoCache() {
    final entrada = _cache.ler(chave);
    if (entrada == null) return null;

    try {
      return (_desserializar(entrada.dados), entrada.gravadoEm);
    } catch (_) {
      // O formato guardado não serve mais para este tipo — uma versão
      // anterior do app, por exemplo. Buscar da rede resolve.
      return null;
    }
  }

  static String _mensagem(Object erro) => switch (erro) {
    NetworkException(:final message) => message,
    ApiException(:final message) => message,
    _ => 'Não foi possível carregar. Tente de novo.',
  };
}
