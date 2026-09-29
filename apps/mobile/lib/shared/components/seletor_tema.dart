import 'package:flutter/material.dart';

import '../../core/theme/theme_controller.dart';

/// Escolha de tema, em três estados.
///
/// Três botões e não um interruptor de duas posições: com dois estados não
/// haveria como voltar a seguir o sistema depois de escolher — a mesma razão
/// que levou o `theme-toggle` da web a ter três.
class SeletorTema extends StatelessWidget {
  const SeletorTema({super.key, required this.controller});

  final ThemeController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => SegmentedButton<ThemeMode>(
        segments: const [
          ButtonSegment(
            value: ThemeMode.system,
            icon: Icon(Icons.brightness_auto_outlined),
            label: Text('Sistema'),
          ),
          ButtonSegment(
            value: ThemeMode.light,
            icon: Icon(Icons.light_mode_outlined),
            label: Text('Claro'),
          ),
          ButtonSegment(
            value: ThemeMode.dark,
            icon: Icon(Icons.dark_mode_outlined),
            label: Text('Escuro'),
          ),
        ],
        selected: {controller.modo},
        onSelectionChanged: (escolha) => controller.definir(escolha.first),
      ),
    );
  }
}
