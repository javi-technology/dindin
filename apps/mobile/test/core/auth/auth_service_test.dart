import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/auth/auth_service.dart';
import 'package:dindin_mobile/core/auth/auth_exception.dart';
import 'package:dindin_mobile/core/auth/sessao.dart';

import 'auth_backend_falso.dart';

// ---------------------------------------------------------------------------
// Autenticação nativa do app (issue #400).
//
// O fluxo do web usa `signInWithPopup`, que é de navegador e não existe no
// celular. `AuthBackend` é a fronteira com o Firebase: o serviço é testado
// sem tocar na rede, e é ele que carrega as regras que valem para o produto
// — sessão que sobrevive à abertura do app e erro em português.
// ---------------------------------------------------------------------------

void main() {
  group('login', () {
    test('com e-mail e senha abre a sessão', () async {
      final backend = AuthBackendFalso();
      final service = AuthService(backend);

      await service.entrarComEmail('a@b.c', 'segredo');

      expect(backend.entradasComEmail, 1);
      expect(service.sessaoAtual?.uid, 'u1');
    });

    test('com Google usa o fluxo nativo da plataforma', () async {
      final backend = AuthBackendFalso();
      final service = AuthService(backend);

      await service.entrarComGoogle();

      expect(backend.entradasComGoogle, 1);
      expect(service.sessaoAtual?.uid, 'u2');
    });

    test('publica a sessão para quem observa', () async {
      final backend = AuthBackendFalso();
      final service = AuthService(backend);
      final vistas = <Sessao?>[];
      final assinatura = service.sessoes.listen(vistas.add);

      await service.entrarComEmail('a@b.c', 'segredo');
      await Future<void>.delayed(Duration.zero);
      await assinatura.cancel();

      expect(vistas.map((s) => s?.uid).toList(), [null, 'u1']);
    });
  });

  // Erro de login é texto de tela: em inglês, e vindo do código do Firebase,
  // o usuário lê "user-not-found" e não sabe o que fazer.
  group('falha de login', () {
    test('credencial inválida vira mensagem em português', () async {
      final backend = AuthBackendFalso()
        ..erroAoEntrar = const CodigoDeAuth('invalid-credential');
      final service = AuthService(backend);

      await expectLater(
        service.entrarComEmail('a@b.c', 'errada'),
        throwsA(
          isA<AuthException>().having(
            (e) => e.message,
            'message',
            'E-mail ou senha inválidos.',
          ),
        ),
      );
    });

    test('cancelamento do Google não é erro para o usuário', () async {
      final backend = AuthBackendFalso()
        ..erroAoEntrar = const CodigoDeAuth('cancelado-pelo-usuario');
      final service = AuthService(backend);

      await expectLater(
        service.entrarComGoogle(),
        throwsA(isA<LoginCanceladoException>()),
      );
    });

    test('código desconhecido não vaza para a tela', () async {
      final backend = AuthBackendFalso()
        ..erroAoEntrar = const CodigoDeAuth('xpto');
      final service = AuthService(backend);

      await expectLater(
        service.entrarComEmail('a@b.c', 'x'),
        throwsA(
          isA<AuthException>().having(
            (e) => e.message,
            'message',
            isNot(contains('xpto')),
          ),
        ),
      );
    });
  });

  group('sessão', () {
    // Sessão perdida a cada abertura do app inviabiliza o uso no celular:
    // a persistência é requisito, não conveniência.
    test('já vem aberta quando o Firebase a restaurou', () async {
      final backend = AuthBackendFalso(
        inicial: const Sessao(uid: 'u9', email: 'v@b.c'),
      );
      final service = AuthService(backend);

      expect(service.sessaoAtual?.uid, 'u9');
    });

    test('logout encerra a sessão', () async {
      final backend = AuthBackendFalso(
        inicial: const Sessao(uid: 'u9', email: 'v@b.c'),
      );
      final service = AuthService(backend);

      await service.sair();

      expect(backend.saidas, 1);
      expect(service.sessaoAtual, isNull);
    });
  });

  group('como TokenProvider', () {
    test('entrega o ID token da sessão', () async {
      final backend = AuthBackendFalso(
        inicial: const Sessao(uid: 'u9', email: 'v@b.c'),
      );
      final service = AuthService(backend);

      expect(await service.idToken(), 'token-1');
    });

    test('repassa o pedido de renovação forçada', () async {
      final backend = AuthBackendFalso(
        inicial: const Sessao(uid: 'u9', email: 'v@b.c'),
      );
      final service = AuthService(backend);

      await service.idToken(forceRefresh: true);

      expect(backend.renovacoes, [true]);
    });

    test('devolve nulo sem sessão', () async {
      final service = AuthService(AuthBackendFalso());

      expect(await service.idToken(), isNull);
    });
  });
}
