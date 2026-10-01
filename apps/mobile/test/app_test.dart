import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/app.dart';
import 'package:dindin_mobile/core/auth/auth_service.dart';
import 'package:dindin_mobile/core/auth/sessao.dart';
import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/data/cache_local.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/notificacoes/notificacoes_service.dart';
import 'package:dindin_mobile/core/assinatura/assinatura_service.dart';
import 'package:dindin_mobile/core/setup/setup_service.dart';
import 'package:dindin_mobile/core/theme/theme_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/auth/auth_backend_falso.dart';
import 'core/notificacoes/notificacoes_backend_falso.dart';
import 'support/cache_de_teste.dart';

// Esqueleto do app (issue #398): as telas chegam nas issues seguintes. O que
// se garante aqui é que o app sobe, é um MaterialApp em português do Brasil e
// já reprova quem o abandonar no boilerplate do `flutter create`.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('sem sessão, abre na tela de login', (tester) async {
    await tester.pumpWidget(
      DinDinApp(
        auth: AuthService(AuthBackendFalso()),
        tema: await ThemeController.carregar(),
        api: DinDinApi(
          ApiClient(
            baseUrl: 'https://api.exemplo',
            tokenProvider: AuthService(AuthBackendFalso()),
          ),
        ),
        cache: await cacheDeTeste(),
        notificacoes: await NotificacoesService.carregar(
          backend: NotificacoesBackendFalso(),
          registrarToken: (_, _) async {},
          removerToken: (_) async {},
        ),
        setup: SetupService(
          DinDinApi(
            ApiClient(
              baseUrl: 'https://api.exemplo',
              tokenProvider: AuthService(AuthBackendFalso()),
            ),
          ),
        ),
        assinatura: AssinaturaService(
          DinDinApi(
            ApiClient(
              baseUrl: 'https://api.exemplo',
              tokenProvider: AuthService(AuthBackendFalso()),
            ),
          ),
        ),
      ),
    );

    await tester.pump();

    expect(find.text('Entrar'), findsOneWidget);
  });

  testWidgets('usa o locale pt-BR', (tester) async {
    await tester.pumpWidget(
      DinDinApp(
        auth: AuthService(AuthBackendFalso()),
        tema: await ThemeController.carregar(),
        api: DinDinApi(
          ApiClient(
            baseUrl: 'https://api.exemplo',
            tokenProvider: AuthService(AuthBackendFalso()),
          ),
        ),
        cache: await cacheDeTeste(),
        notificacoes: await NotificacoesService.carregar(
          backend: NotificacoesBackendFalso(),
          registrarToken: (_, _) async {},
          removerToken: (_) async {},
        ),
        setup: SetupService(
          DinDinApi(
            ApiClient(
              baseUrl: 'https://api.exemplo',
              tokenProvider: AuthService(AuthBackendFalso()),
            ),
          ),
        ),
        assinatura: AssinaturaService(
          DinDinApi(
            ApiClient(
              baseUrl: 'https://api.exemplo',
              tokenProvider: AuthService(AuthBackendFalso()),
            ),
          ),
        ),
      ),
    );

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.locale, const Locale('pt', 'BR'));
  });

  testWidgets('não exibe a faixa de debug', (tester) async {
    await tester.pumpWidget(
      DinDinApp(
        auth: AuthService(AuthBackendFalso()),
        tema: await ThemeController.carregar(),
        api: DinDinApi(
          ApiClient(
            baseUrl: 'https://api.exemplo',
            tokenProvider: AuthService(AuthBackendFalso()),
          ),
        ),
        cache: await cacheDeTeste(),
        notificacoes: await NotificacoesService.carregar(
          backend: NotificacoesBackendFalso(),
          registrarToken: (_, _) async {},
          removerToken: (_) async {},
        ),
        setup: SetupService(
          DinDinApi(
            ApiClient(
              baseUrl: 'https://api.exemplo',
              tokenProvider: AuthService(AuthBackendFalso()),
            ),
          ),
        ),
        assinatura: AssinaturaService(
          DinDinApi(
            ApiClient(
              baseUrl: 'https://api.exemplo',
              tokenProvider: AuthService(AuthBackendFalso()),
            ),
          ),
        ),
      ),
    );

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.debugShowCheckedModeBanner, isFalse);
  });

  // -------------------------------------------------------------------------
  // O cache acompanha a sessão (issue #498)
  //
  // O cache é de quem o gravou. Ele sai junto com a sessão, por qualquer
  // caminho, e não só pelo botão de sair.
  // -------------------------------------------------------------------------
  group('cache e sessão', () {
    Future<Widget> appCom({
      required CacheLocal cache,
      required AuthBackendFalso backend,
    }) async {
      final auth = AuthService(backend);
      final api = DinDinApi(
        ApiClient(
          baseUrl: 'https://api.exemplo',
          tokenProvider: auth,
          httpClient: MockClient((_) async => http.Response('{}', 500)),
        ),
      );

      return DinDinApp(
        auth: auth,
        tema: await ThemeController.carregar(),
        api: api,
        cache: cache,
        notificacoes: await NotificacoesService.carregar(
          backend: NotificacoesBackendFalso(),
          registrarToken: (_, _) async {},
          removerToken: (_) async {},
        ),
        setup: SetupService(api),
        assinatura: AssinaturaService(api),
      );
    }

    testWidgets('apaga o cache que ficou no aparelho quando abre sem sessão', (
      tester,
    ) async {
      final cache = await cacheDeTeste(uid: 'u1');
      await cache.gravar('carteiras', [1]);

      await tester.pumpWidget(
        await appCom(cache: cache, backend: AuthBackendFalso()),
      );
      await tester.pump();

      expect(cache.dono, isNull);
      expect(cache.ler('carteiras'), isNull);
    });

    testWidgets('descarta o cache de outro usuário ao autenticar', (
      tester,
    ) async {
      final cache = await cacheDeTeste(uid: 'u1');
      await cache.gravar('carteiras', [1]);

      await tester.pumpWidget(
        await appCom(
          cache: cache,
          backend: AuthBackendFalso(
            inicial: const Sessao(uid: 'u2', email: 'b@c.d'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(cache.dono, 'u2');
      expect(cache.ler('carteiras'), isNull);
    });

    testWidgets('mantém o cache do mesmo usuário ao autenticar', (
      tester,
    ) async {
      final cache = await cacheDeTeste(uid: 'u1');
      await cache.gravar('carteiras', [1]);

      await tester.pumpWidget(
        await appCom(
          cache: cache,
          backend: AuthBackendFalso(
            inicial: const Sessao(uid: 'u1', email: 'a@b.c'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(cache.dono, 'u1');
      expect(cache.ler('carteiras')!.dados, [1]);
    });
  });
}
