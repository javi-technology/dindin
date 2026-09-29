import 'package:flutter/material.dart';

import 'dindin_colors.dart';

/// Tokens semânticos por papel — o que as telas usam (issue #401).
///
/// Cada papel aponta para um passo da escala no claro e para outro no escuro.
/// Uma tela que use `DinDinColors.jade700` direto fixa o tema claro na
/// marcação; uma que use `tokens.action` acompanha os dois.
///
/// Entra no `ThemeData` como [ThemeExtension], então a tela o alcança por
/// `Theme.of(context).extension<DinDinTokens>()!` — ou pelo atalho
/// `context.tokens`.
@immutable
class DinDinTokens extends ThemeExtension<DinDinTokens> {
  const DinDinTokens({
    required this.surface,
    required this.surfaceElevated,
    required this.surfaceSunken,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.action,
    required this.actionHover,
    required this.onAction,
    required this.accent,
    required this.border,
    required this.borderStrong,
    required this.focus,
    required this.info,
    required this.warning,
    required this.danger,
    required this.dangerHover,
    required this.onDanger,
    required this.positive,
    required this.overlay,
    required this.brandSoft,
    required this.brandInk,
    required this.infoSoft,
    required this.infoInk,
    required this.warningSoft,
    required this.warningInk,
    required this.dangerSoft,
    required this.dangerInk,
    required this.positiveSoft,
    required this.positiveInk,
    required this.chart,
    required this.chartOther,
  });

  /// Fundo da página.
  final Color surface;

  /// Cartão, modal, cabeçalho fixo.
  final Color surfaceElevated;

  /// Cabeçalho de tabela, área rebaixada.
  final Color surfaceSunken;

  /// Título e valor em destaque.
  final Color textPrimary;

  /// Texto corrido e rótulo.
  final Color textSecondary;

  /// Legenda, texto de apoio, ícone neutro.
  final Color textMuted;

  /// Ação primária. Inverte entre os temas: ver [claro] e [escuro].
  final Color action;
  final Color actionHover;
  final Color onAction;

  /// Acento de marca — nunca corpo de texto.
  final Color accent;

  /// Divisor apenas decorativo.
  final Color border;

  /// Borda que carrega informação; atende os 3:1.
  final Color borderStrong;
  final Color focus;
  final Color info;
  final Color warning;

  /// Ícone, borda e valor em baixa.
  final Color danger;
  final Color dangerHover;
  final Color onDanger;

  /// Ícone, borda e valor em alta.
  final Color positive;

  /// Véu do modal. É token porque a opacidade que serve ao claro deixa o
  /// escuro lavado.
  final Color overlay;

  final Color brandSoft;
  final Color brandInk;
  final Color infoSoft;
  final Color infoInk;
  final Color warningSoft;
  final Color warningInk;
  final Color dangerSoft;
  final Color dangerInk;
  final Color positiveSoft;
  final Color positiveInk;

  /// Série categórica dos gráficos, em ordem (issue #393).
  ///
  /// A ordem é o que importa: séries vizinhas se distinguem por
  /// **luminosidade**, não por matiz, para continuarem legíveis em tons de
  /// cinza e para quem tem baixa visão de cor.
  final List<Color> chart;

  /// A fatia que agrupa o restante.
  final Color chartOther;

  /// Tema claro.
  ///
  /// O creme é superfície, nunca ação: #FDFBD4 sobre branco dá 1,05:1. A ação
  /// primária usa o jade escurecido com texto branco (4,63:1), porque o jade
  /// puro sobre branco dá 2,51:1 e reprovaria AA.
  // paridade-web:claro
  static const claro = DinDinTokens(
    surface: DinDinColors.neutral50,
    surfaceElevated: DinDinColors.branco,
    surfaceSunken: DinDinColors.neutral100,
    textPrimary: DinDinColors.neutral950,
    textSecondary: DinDinColors.neutral700,
    textMuted: DinDinColors.neutral600,
    action: DinDinColors.jade700,
    actionHover: DinDinColors.jade900,
    onAction: DinDinColors.branco,
    accent: DinDinColors.creme700,
    border: DinDinColors.neutral200,
    borderStrong: DinDinColors.neutral500,
    focus: DinDinColors.jade700,
    info: DinDinColors.info600,
    warning: DinDinColors.warning600,
    danger: DinDinColors.danger600,
    dangerHover: DinDinColors.danger800,
    onDanger: DinDinColors.branco,
    positive: DinDinColors.positive700,
    overlay: Color(0x80141410),
    brandSoft: DinDinColors.jade50,
    brandInk: DinDinColors.jade900,
    infoSoft: DinDinColors.info50,
    infoInk: DinDinColors.info800,
    warningSoft: DinDinColors.warning50,
    warningInk: DinDinColors.warning800,
    dangerSoft: DinDinColors.danger50,
    dangerInk: DinDinColors.danger800,
    positiveSoft: DinDinColors.positive50,
    positiveInk: DinDinColors.positive900,
    chart: [
      DinDinColors.jade700,
      DinDinColors.jade300,
      DinDinColors.danger800,
      DinDinColors.info400,
      DinDinColors.creme700,
      DinDinColors.positive400,
      DinDinColors.info600,
      DinDinColors.warning400,
    ],
    chartOther: DinDinColors.neutral500,
  );
  // fim-paridade

  /// Tema escuro.
  ///
  /// Os papéis das duas cores da marca se invertem: o jade clareia para virar
  /// ação — `jade-700` contra a superfície escura cai para 3,60:1 e o botão
  /// some — e o creme deixa de ser fundo para virar acento. As superfícies
  /// são neutros quentes, não preto: preto puro com cor saturada por cima
  /// provoca halation.
  ///
  /// O celular é usado no escuro com muito mais frequência que o desktop, e é
  /// por isso que este tema não é acessório.
  // paridade-web:escuro
  static const escuro = DinDinTokens(
    surface: DinDinColors.neutral975,
    surfaceElevated: DinDinColors.neutral900,
    surfaceSunken: DinDinColors.neutral850,
    textPrimary: DinDinColors.neutral200,
    textSecondary: DinDinColors.neutral400,
    textMuted: DinDinColors.neutral450,
    action: DinDinColors.jade500,
    actionHover: DinDinColors.jade400,
    onAction: DinDinColors.jadeInk,
    accent: DinDinColors.creme50,
    border: DinDinColors.neutral800,
    borderStrong: DinDinColors.neutral600,
    focus: DinDinColors.jade400,
    info: DinDinColors.info400,
    warning: DinDinColors.warning400,
    danger: DinDinColors.danger400,
    dangerHover: DinDinColors.danger300,
    onDanger: DinDinColors.neutral950,
    positive: DinDinColors.positive400,
    overlay: Color(0xB3050503),
    brandSoft: DinDinColors.jade950,
    brandInk: DinDinColors.jade300,
    infoSoft: DinDinColors.info950,
    infoInk: DinDinColors.info400,
    warningSoft: DinDinColors.warning950,
    warningInk: DinDinColors.warning400,
    dangerSoft: DinDinColors.danger950,
    dangerInk: DinDinColors.danger400,
    positiveSoft: DinDinColors.positive950,
    positiveInk: DinDinColors.positive400,
    chart: [
      DinDinColors.jade500,
      DinDinColors.jade100,
      DinDinColors.danger600,
      DinDinColors.info400,
      DinDinColors.warning600,
      DinDinColors.positive400,
      DinDinColors.info600,
      DinDinColors.creme300,
    ],
    chartOther: DinDinColors.neutral500,
  );
  // fim-paridade

  @override
  DinDinTokens copyWith() => this;

  /// Não interpola.
  ///
  /// Cor de papel tem razão de contraste medida; um valor no meio do caminho
  /// entre os dois temas não atende nenhum dos dois limites. A troca de tema
  /// é instantânea de propósito.
  @override
  DinDinTokens lerp(ThemeExtension<DinDinTokens>? other, double t) =>
      t < 0.5 ? this : (other as DinDinTokens? ?? this);
}

/// Atalho para os tokens do tema corrente.
extension DinDinTokensContext on BuildContext {
  DinDinTokens get tokens => Theme.of(this).extension<DinDinTokens>()!;
}
