import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/app.dart';
import 'package:dindin_mobile/core/auth/auth_service.dart';
import 'package:dindin_mobile/core/theme/theme_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/auth/auth_backend_falso.dart';

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
      ),
    );

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.debugShowCheckedModeBanner, isFalse);
  });
}
