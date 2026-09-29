import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/notificacoes/notificacoes_backend.dart';
import 'package:dindin_mobile/core/notificacoes/notificacoes_service.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/geladeira/convite_de_notificacao.dart';
import 'package:dindin_mobile/features/inicio/ajustes_de_notificacao.dart';

import '../../core/notificacoes/notificacoes_backend_falso.dart';

// ---------------------------------------------------------------------------
// Permissão e controle das notificações na tela (issue #408).
//
// A permissão é pedida com explicação e no lugar onde o alerta acontece; a
// negativa é tratada sem erro, e o usuário consegue desligar dentro do app.
// ---------------------------------------------------------------------------
void main() {
  late NotificacoesBackendFalso backend;
  late List<String> registrados;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    backend = NotificacoesBackendFalso();
    registrados = [];
  });

  tearDown(() => backend.fechar());

  Future<NotificacoesService> servico() => NotificacoesService.carregar(
    backend: backend,
    registrarToken: (token, _) async => registrados.add(token),
    removerToken: (token) async => registrados.remove(token),
  );

  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: filho),
  );

  group('convite', () {
    testWidgets('explica para que serve antes de pedir', (tester) async {
      await tester.pumpWidget(
        emApp(ConviteDeNotificacao(notificacoes: await servico())),
      );

      expect(find.byKey(const Key('convite-notificacao')), findsOneWidget);
      expect(find.textContaining('preço-alvo'), findsWidgets);
      expect(backend.pedidos, 0);
    });

    testWidgets('pedir a permissão abre a folha do sistema uma vez', (
      tester,
    ) async {
      backend.respostaAoPedir = PermissaoDeNotificacao.concedida;
      await tester.pumpWidget(
        emApp(ConviteDeNotificacao(notificacoes: await servico())),
      );

      await tester.tap(find.byKey(const Key('ligar-notificacoes')));
      await tester.pumpAndSettle();

      expect(backend.pedidos, 1);
      expect(registrados, ['token-1']);
    });

    // Quem negou continua recebendo o alerta por e-mail e não precisa ser
    // lembrado disso a cada visita à geladeira.
    testWidgets('some depois de o usuário decidir', (tester) async {
      backend.respostaAoPedir = PermissaoDeNotificacao.negada;
      await tester.pumpWidget(
        emApp(ConviteDeNotificacao(notificacoes: await servico())),
      );

      await tester.tap(find.byKey(const Key('ligar-notificacoes')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('convite-notificacao')), findsNothing);
    });

    testWidgets('não aparece para quem já decidiu', (tester) async {
      SharedPreferences.setMockInitialValues({
        NotificacoesService.chavePerguntou: true,
      });

      await tester.pumpWidget(
        emApp(ConviteDeNotificacao(notificacoes: await servico())),
      );

      expect(find.byKey(const Key('convite-notificacao')), findsNothing);
    });
  });

  group('ajustes', () {
    testWidgets('desliga dentro do app', (tester) async {
      backend.respostaAoPedir = PermissaoDeNotificacao.concedida;
      final service = await servico();
      await service.pedirPermissao();

      await tester.pumpWidget(
        emApp(AjustesDeNotificacao(notificacoes: service)),
      );

      await tester.tap(find.byKey(const Key('interruptor-notificacoes')));
      await tester.pumpAndSettle();

      expect(service.ativas, isFalse);
      expect(registrados, isEmpty);
    });

    // Religar daqui não reabriria a folha do sistema; dizer isso é melhor do
    // que oferecer um interruptor que não funciona.
    testWidgets('permissão negada no sistema desabilita o interruptor', (
      tester,
    ) async {
      backend.respostaAoPedir = PermissaoDeNotificacao.negada;
      final service = await servico();
      await service.pedirPermissao();

      await tester.pumpWidget(
        emApp(AjustesDeNotificacao(notificacoes: service)),
      );

      final interruptor = tester.widget<SwitchListTile>(
        find.byKey(const Key('interruptor-notificacoes')),
      );
      expect(interruptor.onChanged, isNull);
      expect(find.textContaining('e-mail'), findsOneWidget);
    });
  });
}
