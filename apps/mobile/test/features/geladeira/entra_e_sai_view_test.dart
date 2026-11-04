import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/geladeira/entra_e_sai_view.dart';

// ---------------------------------------------------------------------------
// Quadro "Entra e sai do mês" (issue #586).
//
// O que o BB publica, cruzado com o que o usuário tem. Mover e descongelar são
// sempre decisão dele. "Sem alterações" e "não informado" parecem iguais, mas
// não são: o relatório de agosto/2026 nem traz os blocos.
// ---------------------------------------------------------------------------

RecommendedWallet sugerida({
  RecommendedWalletChanges? changes,
  List<String> renda = const ['KNCR11'],
  List<String> ganho = const ['XPLG11'],
}) {
  RecommendedWalletAsset ativo(String ticker) => RecommendedWalletAsset(
    ticker: ticker,
    segment: 'Papel',
    weight: 0.125,
    closePrice: 100,
    ifixWeight: 0.01,
    inCatalog: true,
  );

  return RecommendedWallet(
    id: 'bb-fii_2026-11',
    provider: RecommendedWalletProvider.fromJson('BB'),
    month: '2026-11',
    revision: 1,
    publishedAt: '2026-11-03',
    sourceFile: 'wallets/fii-bb/CartFII_Nov26.pdf',
    status: RecommendedWalletStatus.fromJson('confirmed'),
    renda: renda.map(ativo).toList(),
    ganho: ganho.map(ativo).toList(),
    changes: changes,
    parsedAt: '2026-11-03T00:00:00Z',
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
  );
}

const novembro = RecommendedWalletChanges(
  renda: RecommendedWalletChange(entering: ['KNCR11'], leaving: ['RZTR11']),
  ganho: RecommendedWalletChange(entering: [], leaving: []),
);

Wallet carteira(String id, String nome) => Wallet(
  id: id,
  ownerId: 'u1',
  name: nome,
  currency: 'BRL',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
);

Position posicao(String ticker, {bool inFridge = false}) => Position(
  id: 'pos-$ticker',
  walletId: 'w1',
  ticker: ticker,
  assetType: AssetType.fii,
  quantity: 10,
  averagePrice: 100,
  inFridge: inFridge,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
);

FridgeItem item(String ticker) => FridgeItem(
  id: 'item-$ticker',
  fridgeId: 'g1',
  ticker: ticker,
  quantity: 7,
  transferredPrice: 100,
  targetPrice: 120,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
);

void main() {
  Position? movida;
  FridgeItem? descongelado;

  setUp(() {
    movida = null;
    descongelado = null;
  });

  Future<void> montar(
    WidgetTester tester,
    RecommendedWallet wallet, {
    List<Position> posicoes = const [],
    List<FridgeItem> itens = const [],
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: Scaffold(
          body: EntraESaiView(
            estado: EstadoDoRecurso(
              dados: DadosDeEntraESai(
                sugerida: wallet,
                carteiras: [carteira('w1', 'Principal')],
                posicoes: posicoes,
                itens: itens,
              ),
            ),
            aoRecarregar: () {},
            aoMover: (p) async => movida = p,
            aoDescongelar: (i) async => descongelado = i,
          ),
        ),
      ),
    );
  }

  group('os três estados', () {
    testWidgets('mostra o que entra e o que sai', (tester) async {
      await montar(tester, sugerida(changes: novembro));

      expect(find.byKey(const Key('entrando-KNCR11')), findsOneWidget);
      expect(find.byKey(const Key('saindo-RZTR11')), findsOneWidget);
    });

    testWidgets('carteira sem mudança diz "sem alterações"', (tester) async {
      await montar(tester, sugerida(changes: novembro));

      expect(find.byKey(const Key('ganho-sem-alteracoes')), findsOneWidget);
      expect(find.byKey(const Key('ganho-nao-informado')), findsNothing);
    });

    testWidgets('sem o dado diz "não informado", não "sem alterações"', (
      tester,
    ) async {
      await montar(tester, sugerida());

      expect(find.byKey(const Key('renda-nao-informado')), findsOneWidget);
      expect(find.byKey(const Key('ganho-nao-informado')), findsOneWidget);
      expect(find.byKey(const Key('renda-sem-alteracoes')), findsNothing);
    });
  });

  group('fundo que sai', () {
    testWidgets('quem o possui vê a quantidade e pode mover', (tester) async {
      await montar(
        tester,
        sugerida(changes: novembro),
        posicoes: [posicao('RZTR11')],
      );

      expect(find.textContaining('cotas em Principal'), findsOneWidget);
      await tester.tap(find.byKey(const Key('mover-pos-RZTR11')));

      expect(movida?.ticker, 'RZTR11');
    });

    testWidgets('quem não o possui só vê a informação', (tester) async {
      await montar(tester, sugerida(changes: novembro));

      expect(find.byKey(const Key('mover-pos-RZTR11')), findsNothing);
    });

    testWidgets('posição já na geladeira não é oferecida de novo', (
      tester,
    ) async {
      await montar(
        tester,
        sugerida(changes: novembro),
        posicoes: [posicao('RZTR11', inFridge: true)],
      );

      expect(find.byKey(const Key('mover-pos-RZTR11')), findsNothing);
    });

    testWidgets('quem continua na outra carteira não vai para a geladeira', (
      tester,
    ) async {
      await montar(
        tester,
        sugerida(
          changes: const RecommendedWalletChanges(
            renda: RecommendedWalletChange(
              entering: ['KNCR11'],
              leaving: ['XPLG11'],
            ),
          ),
        ),
        posicoes: [posicao('XPLG11')],
      );

      expect(
        find.textContaining('Continua recomendado na Carteira Ganho'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('mover-pos-XPLG11')), findsNothing);
    });
  });

  group('fundo que entra', () {
    testWidgets('já na geladeira pode ser descongelado', (tester) async {
      await montar(
        tester,
        sugerida(changes: novembro),
        itens: [item('KNCR11')],
      );

      expect(find.textContaining('cotas na geladeira'), findsOneWidget);
      await tester.tap(find.byKey(const Key('descongelar-item-KNCR11')));

      expect(descongelado?.ticker, 'KNCR11');
    });

    testWidgets('fora da geladeira não oferece descongelar', (tester) async {
      await montar(tester, sugerida(changes: novembro));

      expect(find.byKey(const Key('descongelar-item-KNCR11')), findsNothing);
    });
  });

  test('os dados sobrevivem ao cache', () {
    final dados = DadosDeEntraESai(
      sugerida: sugerida(changes: novembro),
      carteiras: [carteira('w1', 'Principal')],
      posicoes: [posicao('RZTR11')],
      itens: [item('KNCR11')],
    );

    final lidos = DadosDeEntraESai.fromJson(dados.toJson());

    expect(lidos.sugerida.changes?.renda?.leaving, ['RZTR11']);
    expect(lidos.carteiras.single.name, 'Principal');
    expect(lidos.posicoes.single.ticker, 'RZTR11');
    expect(lidos.itens.single.ticker, 'KNCR11');
  });
}
