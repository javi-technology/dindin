import 'package:flutter/material.dart';

import 'dindin_tokens.dart';

/// Tema do app a partir dos tokens da paleta (issue #401).
///
/// O Material traz um `ColorScheme` próprio, e deixá-lo no padrão faria os
/// widgets prontos — `AppBar`, `SnackBar`, `TextField` — pintarem de roxo
/// sobre uma tela que segue a paleta do DinDin. Aqui o esquema é derivado dos
/// mesmos tokens, para o app inteiro falar uma língua só.
abstract final class DinDinTheme {
  static ThemeData get claro => _montar(Brightness.light, DinDinTokens.claro);

  static ThemeData get escuro => _montar(Brightness.dark, DinDinTokens.escuro);

  static ThemeData _montar(Brightness brilho, DinDinTokens t) {
    final esquema = ColorScheme(
      brightness: brilho,
      primary: t.action,
      onPrimary: t.onAction,
      primaryContainer: t.brandSoft,
      onPrimaryContainer: t.brandInk,
      secondary: t.accent,
      onSecondary: t.onAction,
      error: t.danger,
      onError: t.onDanger,
      errorContainer: t.dangerSoft,
      onErrorContainer: t.dangerInk,
      surface: t.surface,
      onSurface: t.textPrimary,
      surfaceContainerHighest: t.surfaceSunken,
      onSurfaceVariant: t.textSecondary,
      outline: t.borderStrong,
      outlineVariant: t.border,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brilho,
      colorScheme: esquema,
      scaffoldBackgroundColor: t.surface,
      extensions: [t],
      appBarTheme: AppBarTheme(
        backgroundColor: t.surfaceElevated,
        foregroundColor: t.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 1,
      ),
      cardTheme: CardThemeData(
        color: t.surfaceElevated,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: t.border),
        ),
      ),
      dividerTheme: DividerThemeData(color: t.border, thickness: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: t.action,
          foregroundColor: t.onAction,
          // 48dp é o alvo de toque confortável no celular; o padrão do
          // Material deixa o botão mais baixo do que o dedo alcança bem.
          minimumSize: const Size.fromHeight(48),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: t.action,
          side: BorderSide(color: t.borderStrong),
          minimumSize: const Size.fromHeight(48),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: t.action),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: t.surfaceElevated,
        labelStyle: TextStyle(color: t.textSecondary),
        // A borda do campo carrega informação, então usa `border-strong`,
        // que atende os 3:1; a decorativa some sobre a superfície escura.
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.borderStrong),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.focus, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.danger, width: 2),
        ),
        errorStyle: TextStyle(color: t.dangerInk),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: t.surfaceElevated,
        surfaceTintColor: Colors.transparent,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: t.action),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: t.surfaceSunken,
        contentTextStyle: TextStyle(color: t.textPrimary),
      ),
      listTileTheme: ListTileThemeData(
        textColor: t.textPrimary,
        iconColor: t.textMuted,
      ),
    );
  }
}
