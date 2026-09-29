import 'package:flutter/material.dart';

/// Escalas da paleta Verde-Jade e Creme (issue #401).
///
/// São os mesmos valores do `@theme` de `apps/web/src/styles.css`, e um teste
/// da suíte compara os dois: o Flutter não lê CSS, e sem essa conferência o
/// app divergiria da web na primeira mudança de paleta — divergência que não
/// quebra compilação e só aparece em captura de tela lado a lado.
///
/// **As telas não usam esta classe.** Elas consomem os tokens semânticos por
/// papel de [DinDinTokens]; apontar um widget direto para `jade700` fixa o
/// tema claro na marcação e some no escuro.
///
/// As escalas não mudam de valor entre os temas. O que muda é o passo para
/// onde cada papel aponta. Ver `docs/paleta.md`.
abstract final class DinDinColors {
  // jade — matiz 158,6°, ancorada em #00BB77 no passo 500
  static const jade50 = Color(0xFFE4FFEE);
  static const jade100 = Color(0xFFCFF9DF);
  static const jade300 = Color(0xFF7DDFAA);
  static const jade400 = Color(0xFF4ACF8F);
  static const jade500 = Color(0xFF00BB77);
  static const jade600 = Color(0xFF009F65);
  static const jade700 = Color(0xFF008654);
  static const jade900 = Color(0xFF005634);
  static const jade950 = Color(0xFF0A2A1F);

  /// Texto sobre a ação primária no escuro.
  ///
  /// Fora da escala de propósito: é um par de contraste, não um passo de
  /// luminosidade.
  static const jadeInk = Color(0xFF0B2E22);

  // creme — matiz 104,9°, ancorada em #FDFBD4 no passo 50
  static const creme50 = Color(0xFFFDFBD4);
  static const creme300 = Color(0xFFE2DC8E);
  static const creme600 = Color(0xFF948B05);
  static const creme700 = Color(0xFF7B7301);
  static const creme900 = Color(0xFF4F4A00);

  // neutral — mesma matiz do creme com croma quase nulo, para o cinza do app
  // não brigar com a marca
  static const neutral50 = Color(0xFFFBFAF4);
  static const neutral100 = Color(0xFFF4F3EB);
  static const neutral200 = Color(0xFFE7E7E1);
  static const neutral300 = Color(0xFFD2D2CC);
  static const neutral400 = Color(0xFFABABA5);
  static const neutral450 = Color(0xFF9A9A94);
  static const neutral500 = Color(0xFF888883);
  static const neutral600 = Color(0xFF696964);
  static const neutral700 = Color(0xFF52524D);
  static const neutral800 = Color(0xFF3A3935);
  static const neutral850 = Color(0xFF2C2C27);
  static const neutral900 = Color(0xFF1F1E1A);
  static const neutral950 = Color(0xFF141410);
  static const neutral975 = Color(0xFF12120E);

  static const info50 = Color(0xFFE3F5FA);
  static const info400 = Color(0xFF28BDE0);
  static const info600 = Color(0xFF0388A4);
  static const info800 = Color(0xFF045A6D);
  static const info950 = Color(0xFF0D2A31);

  static const warning50 = Color(0xFFF9EFD8);
  static const warning400 = Color(0xFFD7A035);
  static const warning600 = Color(0xFF9F7100);
  static const warning800 = Color(0xFF6E4E00);
  static const warning950 = Color(0xFF2E2410);

  static const danger50 = Color(0xFFFDECEC);

  /// Hover do botão destrutivo no escuro, onde ele precisa clarear.
  static const danger300 = Color(0xFFFBB0AB);
  static const danger400 = Color(0xFFF8837C);
  static const danger600 = Color(0xFFC04442);
  static const danger800 = Color(0xFF8E2E2C);
  static const danger950 = Color(0xFF331A19);

  /// Verde distinto do jade de propósito: um botão primário e um número em
  /// alta não podem disputar a mesma cor na tela.
  static const positive50 = Color(0xFFE6F4E8);
  static const positive400 = Color(0xFF70C174);
  static const positive700 = Color(0xFF167425);
  static const positive900 = Color(0xFF10561C);
  static const positive950 = Color(0xFF16261A);

  static const branco = Color(0xFFFFFFFF);
}
