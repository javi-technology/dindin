import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/geladeira/geladeira_form.dart';

// ---------------------------------------------------------------------------
// Criar, renomear e excluir geladeira no app (issue #444).
//
// A #440 garantiu a Geladeira Principal a quem entra, mas quem quisesse uma
// segunda — ou renomear a que tem — continuava dependendo do site. A #403
// cobriu carteiras, posições, itens e proventos com o mesmo critério de
// paridade; geladeira ficou de fora.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: SingleChildScrollView(child: filho)),
  );

  group('GeladeiraForm', () {
    testWidgets('envia o nome e a descrição informados', (tester) async {
      CreateFridgeRequest? enviado;
      await tester.pumpWidget(
        emApp(
          GeladeiraForm(
            aoSalvar: (dados) async {
              enviado = dados;
              return true;
            },
          ),
        ),
      );

      await tester.enterText(
        find.byKey(const Key('campo-nome')),
        'Geladeira de FIIs',
      );
      await tester.enterText(
        find.byKey(const Key('campo-descricao')),
        'Ativos à espera do preço-alvo',
      );
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviado?.name, 'Geladeira de FIIs');
      expect(enviado?.description, 'Ativos à espera do preço-alvo');
    });

    testWidgets('recusa nome vazio sem chamar a API', (tester) async {
      var chamadas = 0;
      await tester.pumpWidget(
        emApp(
          GeladeiraForm(
            aoSalvar: (_) async {
              chamadas += 1;
              return true;
            },
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(chamadas, 0);
      expect(find.text('Informe o nome.'), findsOneWidget);
    });

    testWidgets('abre preenchido ao renomear', (tester) async {
      await tester.pumpWidget(
        emApp(
          GeladeiraForm(
            aoSalvar: (_) async => true,
            nomeInicial: 'Geladeira Principal',
            descricaoInicial: 'A de sempre',
          ),
        ),
      );

      expect(find.text('Geladeira Principal'), findsOneWidget);
      expect(find.text('A de sempre'), findsOneWidget);
    });
  });

  group('DinDinApi', () {
    late List<(String, String, Object?)> enviadas;

    DinDinApi apiFalsa() {
      enviadas = [];
      return DinDinApi(
        ApiClient(
          baseUrl: 'https://api.exemplo',
          tokenProvider: _ComToken(),
          httpClient: MockClient((req) async {
            enviadas.add((
              req.method,
              req.url.path,
              req.body.isEmpty ? null : jsonDecode(req.body),
            ));
            if (req.method == 'DELETE') return http.Response('', 204);
            return http.Response(
              jsonEncode({
                'id': 'g1',
                'ownerId': 'u1',
                'name': 'Geladeira de FIIs',
                'createdAt': '2026-09-01T00:00:00Z',
                'updatedAt': '2026-09-01T00:00:00Z',
              }),
              200,
            );
          }),
        ),
      );
    }

    test('cria a geladeira', () async {
      final api = apiFalsa();

      final criada = await api.criarGeladeira(
        const CreateFridgeRequest(name: 'Geladeira de FIIs'),
      );

      expect(enviadas.single.$1, 'POST');
      expect(enviadas.single.$2, '/api/fridges');
      expect(criada.name, 'Geladeira de FIIs');
    });

    test('renomeia a geladeira', () async {
      final api = apiFalsa();

      await api.atualizarGeladeira(
        'g1',
        const UpdateFridgeRequest(name: 'Outro nome'),
      );

      expect(enviadas.single.$1, 'PUT');
      expect(enviadas.single.$2, '/api/fridges/g1');
    });

    test('exclui a geladeira', () async {
      final api = apiFalsa();

      await api.excluirGeladeira('g1');

      expect(enviadas.single.$1, 'DELETE');
      expect(enviadas.single.$2, '/api/fridges/g1');
    });
  });
}
