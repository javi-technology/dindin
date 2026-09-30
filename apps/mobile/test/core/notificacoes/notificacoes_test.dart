import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/notificacoes/notificacoes_backend.dart';
import 'package:dindin_mobile/core/notificacoes/notificacoes_service.dart';

import 'notificacoes_backend_falso.dart';

// ---------------------------------------------------------------------------
// Notificações push no app (issue #408).
//
// A permissão é pedida num momento que faça sentido — na geladeira, onde o
// alerta acontece —, e não na primeira abertura sem contexto. Negar é estado
// **normal**, não erro: nesse caso o e-mail continua sendo o canal.
// ---------------------------------------------------------------------------

class _ApiFalsa {
  final List<(String, String)> registrados = [];
  final List<String> removidos = [];
  Object? erro;

  Future<void> registrar(String token, String plataforma) async {
    if (erro != null) throw erro!;
    registrados.add((token, plataforma));
  }

  Future<void> remover(String token) async {
    if (erro != null) throw erro!;
    removidos.add(token);
  }
}

void main() {
  late NotificacoesBackendFalso backend;
  late _ApiFalsa api;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    backend = NotificacoesBackendFalso();
    api = _ApiFalsa();
  });

  tearDown(() => backend.fechar());

  Future<NotificacoesService> abrir() => NotificacoesService.carregar(
    backend: backend,
    registrarToken: api.registrar,
    removerToken: api.remover,
  );

  // -------------------------------------------------------------------------
  // Registro na abertura (issue #408)
  //
  // O token muda quando o usuário reinstala, troca de aparelho ou limpa os
  // dados — e isso acontece com o app fechado. Registrando só ao conceder a
  // permissão, o token novo nunca chegava à API e o push parava de funcionar
  // em silêncio, sem nada na tela que indicasse o motivo.
  // -------------------------------------------------------------------------
  group('abertura do app', () {
    test('falha ao obter token não impede a abertura', () async {
      backend
        ..permissao = PermissaoDeNotificacao.concedida
        ..erroAoObterToken = Exception('APNs ainda indisponível');

      final service = await abrir();

      expect(service.ativas, isFalse);
      expect(api.registrados, isEmpty);
    });

    test('registra o token atual de quem já concedeu a permissão', () async {
      backend.permissao = PermissaoDeNotificacao.concedida;
      backend.tokenDoAparelho = 'token-novo';

      final service = await abrir();

      expect(api.registrados.map((r) => r.$1).toList(), ['token-novo']);
      expect(service.ativas, isTrue);
    });

    test('não registra quem não concedeu a permissão', () async {
      backend.permissao = PermissaoDeNotificacao.negada;

      await abrir();

      expect(api.registrados, isEmpty);
    });

    // Desligar dentro do app precisa continuar valendo na próxima abertura:
    // registrar de novo faria o push voltar sozinho.
    test('não registra quem desligou o push no app', () async {
      SharedPreferences.setMockInitialValues({
        NotificacoesService.chaveDesligado: true,
      });
      backend.permissao = PermissaoDeNotificacao.concedida;

      await abrir();

      expect(api.registrados, isEmpty);
    });
  });

  group('permissão', () {
    test('começa sem ter perguntado', () async {
      final service = await abrir();

      expect(service.permissao, PermissaoDeNotificacao.naoPerguntada);
      expect(backend.pedidos, 0);
    });

    test('concedida registra o token no backend', () async {
      backend.permissao = PermissaoDeNotificacao.concedida;
      final service = await abrir();

      await service.pedirPermissao();

      expect(backend.pedidos, 1);
      expect(api.registrados, [('token-1', 'android')]);
      expect(service.ativas, isTrue);
    });

    // Negar é escolha do usuário, não falha: a tela não mostra erro e o
    // e-mail segue sendo o canal.
    test('negada não registra token nem é tratada como erro', () async {
      backend.permissao = PermissaoDeNotificacao.negada;
      final service = await abrir();

      await service.pedirPermissao();

      expect(api.registrados, isEmpty);
      expect(service.ativas, isFalse);
      expect(service.erro, isNull);
    });

    // Pedir de novo depois da negativa não reabre a folha do sistema e ainda
    // incomoda: o app lembra que já perguntou.
    test('não pergunta de novo depois da negativa', () async {
      backend.permissao = PermissaoDeNotificacao.negada;
      final service = await abrir();
      await service.pedirPermissao();

      await service.pedirPermissao();

      expect(backend.pedidos, 1);
    });

    test('a decisão sobrevive à reabertura do app', () async {
      backend.permissao = PermissaoDeNotificacao.negada;
      await (await abrir()).pedirPermissao();

      final outra = await abrir();

      expect(outra.jaPerguntou, isTrue);
    });
  });

  group('token', () {
    test('sem token do aparelho, não chama o backend', () async {
      backend
        ..permissao = PermissaoDeNotificacao.concedida
        ..tokenDoAparelho = null;
      final service = await abrir();

      await service.pedirPermissao();

      expect(api.registrados, isEmpty);
      expect(service.ativas, isFalse);
    });

    // O token muda quando o usuário reinstala o app ou troca de aparelho; se
    // o app não reenviar, o alerta deixa de chegar sem ninguém perceber.
    test('token renovado é reenviado ao backend', () async {
      backend.permissao = PermissaoDeNotificacao.concedida;
      final service = await abrir();
      await service.pedirPermissao();

      backend.renovar('token-2');
      await Future<void>.delayed(Duration.zero);

      expect(api.registrados, [('token-1', 'android'), ('token-2', 'android')]);
    });

    test('token renovado sem permissão não é enviado', () async {
      backend.permissao = PermissaoDeNotificacao.negada;
      final service = await abrir();
      await service.pedirPermissao();

      backend.renovar('token-2');
      await Future<void>.delayed(Duration.zero);

      expect(api.registrados, isEmpty);
    });

    // Falha de rede ao registrar não pode impedir o app de abrir: o push é um
    // canal a mais, e o e-mail continua.
    test('falha ao registrar não derruba o app', () async {
      backend.permissao = PermissaoDeNotificacao.concedida;
      api.erro = Exception('sem rede');
      final service = await abrir();

      await service.pedirPermissao();

      expect(service.ativas, isFalse);
      expect(service.erro, isNotNull);
    });
  });

  group('desligar dentro do app', () {
    test('remove o token do backend e do aparelho', () async {
      backend.permissao = PermissaoDeNotificacao.concedida;
      final service = await abrir();
      await service.pedirPermissao();

      await service.desligar();

      expect(api.removidos, ['token-1']);
      expect(service.ativas, isFalse);
    });

    test('a escolha de desligar sobrevive à reabertura', () async {
      backend.permissao = PermissaoDeNotificacao.concedida;
      final service = await abrir();
      await service.pedirPermissao();
      await service.desligar();

      final outra = await abrir();

      expect(outra.ativas, isFalse);
    });

    // Religar não deve exigir que o usuário vá às configurações do sistema
    // quando a permissão nunca foi revogada por lá.
    test('religar registra o token de novo', () async {
      backend.permissao = PermissaoDeNotificacao.concedida;
      final service = await abrir();
      await service.pedirPermissao();
      await service.desligar();

      await service.ligar();

      expect(service.ativas, isTrue);
      expect(api.registrados, hasLength(2));
    });
  });
}
