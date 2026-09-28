import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/theme/theme_controller.dart';

// ---------------------------------------------------------------------------
// Escolha de tema (issue #401).
//
// O padrão é a preferência do sistema operacional, e a escolha explícita do
// usuário vence e sobrevive ao fechamento do app. São três estados, não um
// interruptor de dois: com dois não haveria como voltar a seguir o sistema.
// ---------------------------------------------------------------------------
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<ThemeController> abrir() => ThemeController.carregar();

  test('começa seguindo o sistema', () async {
    final controller = await abrir();

    expect(controller.modo, ThemeMode.system);
  });

  test('alterna para claro e para escuro', () async {
    final controller = await abrir();

    await controller.definir(ThemeMode.dark);
    expect(controller.modo, ThemeMode.dark);

    await controller.definir(ThemeMode.light);
    expect(controller.modo, ThemeMode.light);
  });

  test('avisa quem observa', () async {
    final controller = await abrir();
    var avisos = 0;
    controller.addListener(() => avisos++);

    await controller.definir(ThemeMode.dark);

    expect(avisos, 1);
  });

  group('persistência', () {
    test('a escolha sobrevive à reabertura do app', () async {
      final primeiro = await abrir();
      await primeiro.definir(ThemeMode.dark);

      expect((await abrir()).modo, ThemeMode.dark);
    });

    // "Seguir o sistema" é a ausência de escolha: guardar um valor para ele
    // faria o app ignorar a mudança de preferência do aparelho.
    test('voltar ao sistema apaga a escolha guardada', () async {
      final controller = await abrir();
      await controller.definir(ThemeMode.dark);
      await controller.definir(ThemeMode.system);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.containsKey(ThemeController.chave), isFalse);
      expect((await abrir()).modo, ThemeMode.system);
    });

    test('valor guardado inválido não quebra a abertura', () async {
      SharedPreferences.setMockInitialValues({
        ThemeController.chave: 'roxo-neon',
      });

      expect((await abrir()).modo, ThemeMode.system);
    });
  });
}
