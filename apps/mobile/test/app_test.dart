import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/app.dart';

// Esqueleto do app (issue #398): as telas chegam nas issues seguintes. O que
// se garante aqui é que o app sobe, é um MaterialApp em português do Brasil e
// já reprova quem o abandonar no boilerplate do `flutter create`.
void main() {
  testWidgets('sobe com o nome do produto', (tester) async {
    await tester.pumpWidget(const DinDinApp());

    expect(find.text('DinDin'), findsOneWidget);
  });

  testWidgets('usa o locale pt-BR', (tester) async {
    await tester.pumpWidget(const DinDinApp());

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.locale, const Locale('pt', 'BR'));
  });

  testWidgets('não exibe a faixa de debug', (tester) async {
    await tester.pumpWidget(const DinDinApp());

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.debugShowCheckedModeBanner, isFalse);
  });
}
