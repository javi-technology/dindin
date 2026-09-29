import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/simulacao/comparacao_view.dart';
import 'package:dindin_mobile/features/simulacao/simulacao_form.dart';
import 'package:dindin_mobile/features/simulacao/resultado_view.dart';

// ---------------------------------------------------------------------------
// Simulação e comparação (issue #404).
//
// A simulação geral por carteira sugerida é **gratuita**. A simulação por
// ativo específico exige assinatura, e no app essa liberação depende de compra
// in-app — issue própria (#405): aqui o ponto de entrada existe e é marcado.
// ---------------------------------------------------------------------------
WalletSimulationResponse resultado({
  double unallocatedAmount = 20,
  List<SimulationItem> byTicker = const [],
  List<String> missingDividendTickers = const [],
}) => WalletSimulationResponse(
  amount: 1000,
  months: 12,
  mode: SimulationMode.reinvest,
  allocatedAmount: 980,
  unallocatedAmount: unallocatedAmount,
  monthlyIncome: 8.5,
  totalIncome: 102,
  reinvestedAmount: 90,
  uninvestedIncome: 12,
  byTicker: byTicker,
  missingDividendTickers: missingDividendTickers,
  staleDividendTickers: const [],
  basis: const SimulationBasis(
    source: 'monthlyDividend',
    assumesRepetition: true,
    staleAfterDays: 45,
  ),
  provider: const SimulationWalletProvider(
    slug: 'bb-fii',
    label: 'BB',
    provider: RecommendedWalletProvider.bb,
  ),
  walletMonth: '2026-09',
  tab: AiSuggestionTab.renda,
);

SimulationItem item({
  String ticker = 'HGLG11',
  double quantity = 6,
  bool missingDividend = false,
}) => SimulationItem(
  ticker: ticker,
  price: 160,
  monthlyDividend: missingDividend ? 0 : 1.1,
  quantity: quantity,
  finalQuantity: quantity,
  investedAmount: 960,
  monthlyIncome: missingDividend ? 0 : 6.6,
  totalIncome: missingDividend ? 0 : 79.2,
  missingDividend: missingDividend ? true : null,
);

void main() {
  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: filho),
  );

  group('formulário', () {
    final opcoes = [
      const SimulationWalletOption(
        slug: 'bb-fii',
        label: 'BB',
        provider: RecommendedWalletProvider.bb,
        months: ['2026-09', '2026-08'],
      ),
      const SimulationWalletOption(
        slug: 'xp-fii',
        label: 'XP',
        provider: RecommendedWalletProvider.bb,
        months: ['2026-09'],
      ),
    ];

    Future<void> montar(
      WidgetTester tester, {
      required Future<bool> Function(WalletSimulationRequest) aoSimular,
      List<SimulationWalletOption>? disponiveis,
    }) => tester.pumpWidget(
      emApp(
        SimulacaoForm(carteiras: disponiveis ?? opcoes, aoSimular: aoSimular),
      ),
    );

    testWidgets('envia valor, horizonte e modo', (tester) async {
      WalletSimulationRequest? enviado;
      await montar(
        tester,
        aoSimular: (dados) async {
          enviado = dados;
          return true;
        },
      );

      await tester.enterText(find.byKey(const Key('campo-valor')), '1.500,55');
      await tester.tap(find.byKey(const Key('botao-simular')));
      await tester.pumpAndSettle();

      // O texto vai como foi digitado: a API converte pt-BR, e converter dos
      // dois lados é convidar os dois a discordarem.
      expect(enviado?.amount, '1.500,55');
      expect(enviado?.months, isNotNull);
      expect(enviado?.mode, SimulationMode.reinvest);
    });

    // O sistema prevê mais carteiras sugeridas além da do BB: assumir uma só
    // quebraria a tela na segunda.
    testWidgets('permite escolher entre as carteiras disponíveis', (
      tester,
    ) async {
      await montar(tester, aoSimular: (_) async => true);

      expect(find.byKey(const Key('campo-carteira')), findsOneWidget);
      expect(find.text('BB'), findsWidgets);
    });

    testWidgets('com uma só carteira, não pede escolha', (tester) async {
      await montar(
        tester,
        aoSimular: (_) async => true,
        disponiveis: [opcoes.first],
      );

      expect(find.byKey(const Key('campo-carteira')), findsNothing);
    });

    testWidgets('não simula sem valor', (tester) async {
      var simulou = false;
      await montar(
        tester,
        aoSimular: (_) async {
          simulou = true;
          return true;
        },
      );

      await tester.tap(find.byKey(const Key('botao-simular')));
      await tester.pumpAndSettle();

      expect(simulou, isFalse);
      expect(find.text('Informe o valor.'), findsOneWidget);
    });

    testWidgets('o botão fica indisponível durante a simulação', (
      tester,
    ) async {
      final resposta = Completer<bool>();
      await montar(tester, aoSimular: (_) => resposta.future);

      await tester.enterText(find.byKey(const Key('campo-valor')), '1000');
      await tester.tap(find.byKey(const Key('botao-simular')));
      await tester.pump();

      final botao = tester.widget<FilledButton>(
        find.byKey(const Key('botao-simular')),
      );
      expect(botao.onPressed, isNull);

      resposta.complete(true);
      await tester.pumpAndSettle();
    });
  });

  group('resultado', () {
    // ---------------------------------------------------------------------
    // O resultado é embutido na lista da tela (issue #404)
    //
    // Sendo ele próprio rolável, vira viewport sem altura definida dentro de
    // outra e o Flutter lança em tempo de execução. Não aparece na análise
    // estática nem nos testes que o montam sozinho — só na tela real, logo
    // depois de a simulação dar certo.
    // ---------------------------------------------------------------------
    testWidgets('cabe dentro de uma lista rolável', (tester) async {
      await tester.pumpWidget(
        emApp(
          ListView(
            children: [
              ResultadoView(
                resultado: resultado(byTicker: [item()]),
                aoSimularAtivo: null,
              ),
            ],
          ),
        ),
      );

      expect(tester.takeException(), isNull);
      expect(find.text('HGLG11'), findsOneWidget);
    });

    testWidgets('mostra renda projetada, cotas e troco', (tester) async {
      await tester.pumpWidget(
        emApp(
          ResultadoView(
            resultado: resultado(byTicker: [item()]),
            aoSimularAtivo: null,
          ),
        ),
      );

      expect(find.textContaining('8,50'), findsWidgets);
      expect(find.text('HGLG11'), findsOneWidget);
      expect(find.byKey(const Key('troco')), findsOneWidget);
    });

    // O troco não rende: escondê-lo faria a conta do usuário não fechar.
    testWidgets('troco zero não vira linha vazia', (tester) async {
      await tester.pumpWidget(
        emApp(
          ResultadoView(
            resultado: resultado(unallocatedAmount: 0, byTicker: [item()]),
            aoSimularAtivo: null,
          ),
        ),
      );

      expect(find.byKey(const Key('troco')), findsNothing);
    });

    testWidgets('deixa a premissa visível', (tester) async {
      await tester.pumpWidget(
        emApp(
          ResultadoView(
            resultado: resultado(byTicker: [item()]),
            aoSimularAtivo: null,
          ),
        ),
      );

      expect(find.byKey(const Key('premissa-simulacao')), findsOneWidget);
      expect(find.textContaining('último provento'), findsOneWidget);
    });

    testWidgets('ativo sem provento conhecido é declarado, não zerado', (
      tester,
    ) async {
      await tester.pumpWidget(
        emApp(
          ResultadoView(
            resultado: resultado(
              byTicker: [item(ticker: 'XPTO11', missingDividend: true)],
              missingDividendTickers: const ['XPTO11'],
            ),
            aoSimularAtivo: null,
          ),
        ),
      );

      expect(find.byKey(const Key('sem-provento-XPTO11')), findsOneWidget);
    });

    // O ponto de entrada da simulação por ativo existe e é marcado como
    // recurso de assinante; a liberação é a issue #405.
    group('simulação por ativo', () {
      testWidgets('o ponto de entrada é marcado como recurso de assinante', (
        tester,
      ) async {
        await tester.pumpWidget(
          emApp(
            ResultadoView(
              resultado: resultado(byTicker: [item()]),
              aoSimularAtivo: (_) {},
            ),
          ),
        );

        expect(find.byKey(const Key('simular-ativo-HGLG11')), findsOneWidget);
        expect(find.byKey(const Key('selo-assinante')), findsWidgets);
      });

      testWidgets('sem o ponto de entrada, o selo não aparece', (tester) async {
        await tester.pumpWidget(
          emApp(
            ResultadoView(
              resultado: resultado(byTicker: [item()]),
              aoSimularAtivo: null,
            ),
          ),
        );

        expect(find.byKey(const Key('selo-assinante')), findsNothing);
      });
    });
  });

  group('comparação', () {
    RecommendedWalletComparison comparacao({
      List<RecommendedWalletComparisonItem> items = const [],
    }) => RecommendedWalletComparison(
      recommended: RecommendedWallet(
        id: 'bb-fii_2026-09',
        provider: RecommendedWalletProvider.bb,
        month: '2026-09',
        revision: 1,
        publishedAt: '2026-09-01',
        sourceFile: 'x.pdf',
        status: RecommendedWalletStatus.confirmed,
        renda: const [],
        ganho: const [],
        parsedAt: '2026-09-01T00:00:00Z',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      ),
      items: items,
      totalValue: 960,
    );

    Widget comComparacao(EstadoDoRecurso<RecommendedWalletComparison> estado) =>
        emApp(ComparacaoView(estado: estado, aoRecarregar: () {}));

    testWidgets('mostra ticker, peso sugerido e peso atual', (tester) async {
      await tester.pumpWidget(
        comComparacao(
          EstadoDoRecurso(
            dados: comparacao(
              items: const [
                RecommendedWalletComparisonItem(
                  ticker: 'HGLG11',
                  recommendedWeight: 0.2,
                  currentWeight: 0.15,
                  quantity: 6,
                  currentValue: 960,
                  status: 'match',
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text('HGLG11'), findsOneWidget);
      expect(find.textContaining('20,00%'), findsOneWidget);
      expect(find.textContaining('15,00%'), findsOneWidget);
    });

    // A comparação é a tela mais densa do produto e precisa caber na largura
    // de um celular sem virar rolagem horizontal.
    testWidgets('não rola na horizontal', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        comComparacao(
          EstadoDoRecurso(
            dados: comparacao(
              items: const [
                RecommendedWalletComparisonItem(
                  ticker: 'HGLG11',
                  recommendedWeight: 0.2,
                  currentWeight: 0.15,
                  quantity: 6,
                  currentValue: 960,
                  status: 'match',
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final horizontais = find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.right,
      );
      expect(horizontais, findsNothing);
    });

    testWidgets('ativo ausente na carteira é sinalizado, não zerado', (
      tester,
    ) async {
      await tester.pumpWidget(
        comComparacao(
          EstadoDoRecurso(
            dados: comparacao(
              items: const [
                RecommendedWalletComparisonItem(
                  ticker: 'XPLG11',
                  recommendedWeight: 0.1,
                  currentWeight: null,
                  quantity: 0,
                  currentValue: 0,
                  status: 'missing',
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('ausente-XPLG11')), findsOneWidget);
    });

    testWidgets('erro oferece nova tentativa', (tester) async {
      await tester.pumpWidget(
        comComparacao(const EstadoDoRecurso(erro: 'Sem conexão.')),
      );

      expect(find.text('Tentar de novo'), findsOneWidget);
    });
  });
}
