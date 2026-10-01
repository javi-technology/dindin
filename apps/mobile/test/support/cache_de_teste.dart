import 'package:dindin_mobile/core/data/cache_local.dart';

import 'armazenamento_em_memoria.dart';

export 'armazenamento_em_memoria.dart';

/// Cache pronto para os testes de tela: em memória e já vinculado a um
/// usuário.
///
/// Fica fora dos testes porque quase toda tela passa por `Recurso`, e abrir o
/// cache de verdade exigiria o armazenamento seguro do sistema, que não existe
/// no teste. Sem usuário vinculado o cache não lê nem grava (issue #498), então
/// o auxiliar já entrega um.
Future<CacheLocal> cacheDeTeste({
  String uid = 'usuario-teste',
  ArmazenamentoEmMemoria? armazenamento,
}) async {
  final cache = await CacheLocal.abrir(
    armazenamento: armazenamento ?? ArmazenamentoEmMemoria(),
  );
  await cache.vincularA(uid);
  return cache;
}
