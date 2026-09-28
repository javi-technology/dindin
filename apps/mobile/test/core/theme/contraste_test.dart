import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/theme/dindin_tokens.dart';

// ---------------------------------------------------------------------------
// Limites de contraste da paleta (issue #401, docs/paleta.md).
//
// O celular é usado no escuro com muito mais frequência que o desktop, então
// o tema escuro do app não é acessório: os dois temas respondem pelos mesmos
// limites — 4,5:1 para texto e 3:1 para borda e ícone informativos.
//
// Sem estes testes, "segue a paleta" seria só uma intenção: a regressão que
// eles pegam é a de alguém apontar um papel para o passo errado da escala, que
// não quebra compilação nem aparece em captura de tela no claro.
// ---------------------------------------------------------------------------

/// Luminância relativa da WCAG.
double _luminancia(Color cor) {
  double canal(double bruto) => bruto <= 0.03928
      ? bruto / 12.92
      : math.pow((bruto + 0.055) / 1.055, 2.4).toDouble();

  return 0.2126 * canal(cor.r) + 0.7152 * canal(cor.g) + 0.0722 * canal(cor.b);
}

double razao(Color a, Color b) {
  final la = _luminancia(a);
  final lb = _luminancia(b);
  final claro = math.max(la, lb);
  final escuro = math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

void main() {
  final temas = {'claro': DinDinTokens.claro, 'escuro': DinDinTokens.escuro};

  temas.forEach((nome, t) {
    group('tema $nome', () {
      group('texto sobre a superfície — 4,5:1', () {
        final casos = {
          'text-primary': (t.textPrimary, t.surface),
          'text-secondary': (t.textSecondary, t.surface),
          'text-muted': (t.textMuted, t.surface),
          'text-primary no elevado': (t.textPrimary, t.surfaceElevated),
          'text-secondary no elevado': (t.textSecondary, t.surfaceElevated),
          'text-muted no rebaixado': (t.textMuted, t.surfaceSunken),
        };

        casos.forEach((rotulo, par) {
          test(rotulo, () {
            expect(razao(par.$1, par.$2), greaterThanOrEqualTo(4.5));
          });
        });
      });

      group('texto sobre o próprio fundo — 4,5:1', () {
        final casos = {
          'on-action sobre action': (t.onAction, t.action),
          'on-danger sobre danger': (t.onDanger, t.danger),
          'brand-ink sobre brand-soft': (t.brandInk, t.brandSoft),
          'info-ink sobre info-soft': (t.infoInk, t.infoSoft),
          'warning-ink sobre warning-soft': (t.warningInk, t.warningSoft),
          'danger-ink sobre danger-soft': (t.dangerInk, t.dangerSoft),
          'positive-ink sobre positive-soft': (t.positiveInk, t.positiveSoft),
        };

        casos.forEach((rotulo, par) {
          test(rotulo, () {
            expect(razao(par.$1, par.$2), greaterThanOrEqualTo(4.5));
          });
        });
      });

      // O passo `-ink` serve ao texto dentro e fora do tom suave; se só
      // passasse sobre o tom suave, a tela precisaria de dois tokens para
      // o mesmo papel.
      group('-ink também sobre a superfície comum — 4,5:1', () {
        final casos = {
          'brand-ink': t.brandInk,
          'info-ink': t.infoInk,
          'warning-ink': t.warningInk,
          'danger-ink': t.dangerInk,
          'positive-ink': t.positiveInk,
        };

        casos.forEach((rotulo, cor) {
          test(rotulo, () {
            expect(razao(cor, t.surface), greaterThanOrEqualTo(4.5));
          });
        });
      });

      group('borda e ícone informativos — 3:1', () {
        final casos = {
          'border-strong': t.borderStrong,
          'focus': t.focus,
          'action': t.action,
          'info': t.info,
          'warning': t.warning,
          'danger': t.danger,
          'positive': t.positive,
          'accent': t.accent,
        };

        casos.forEach((rotulo, cor) {
          test(rotulo, () {
            expect(razao(cor, t.surface), greaterThanOrEqualTo(3.0));
          });
        });
      });

      // Séries vizinhas se distinguem por luminosidade, não por matiz, para
      // continuarem legíveis em tons de cinza e para quem tem baixa visão de
      // cor (issue #393).
      group('série dos gráficos', () {
        test('cada série se separa da superfície em 1,5:1', () {
          for (var i = 0; i < t.chart.length; i++) {
            expect(
              razao(t.chart[i], t.surface),
              greaterThanOrEqualTo(1.5),
              reason: 'chart-${i + 1}',
            );
          }
        });

        test('séries vizinhas se separam em 1,5:1', () {
          for (var i = 0; i < t.chart.length - 1; i++) {
            expect(
              razao(t.chart[i], t.chart[i + 1]),
              greaterThanOrEqualTo(1.5),
              reason: 'chart-${i + 1} vs chart-${i + 2}',
            );
          }
        });
      });
    });
  });

  // A regra que a #393 e a docs/paleta.md fixam: alta e baixa nunca usam o
  // token da marca, ou um botão primário e um número em alta disputariam a
  // mesma cor na tela.
  test('positive é distinto do token da marca', () {
    for (final t in temas.values) {
      expect(t.positive, isNot(t.action));
    }
  });
}
