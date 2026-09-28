import 'package:intl/intl.dart';

/// Datas no padrão brasileiro (issue #402).
///
/// Os padrões são numéricos de propósito: `DateFormat` com nome de locale
/// exige `initializeDateFormatting`, e dia/mês/ano não dependem de dado de
/// idioma — a ordem brasileira está no próprio padrão.
abstract final class Data {
  static final _diaMesAno = DateFormat('dd/MM/yyyy');
  static final _mesAno = DateFormat('MM/yyyy');

  /// Converte `YYYY-MM-DD` da API para `dd/MM/yyyy`.
  ///
  /// Texto fora do formato volta como veio: um provento com data estranha
  /// ainda precisa aparecer na lista, e sumir com ele seria pior do que
  /// exibi-lo cru.
  static String diaMesAno(String iso) {
    final data = DateTime.tryParse(iso);
    return data == null ? iso : _diaMesAno.format(data);
  }

  /// Converte `dd/MM/yyyy` da tela para `YYYY-MM-DD` da API.
  ///
  /// Devolve `null` quando a data não existe — `32/13/2026` é erro de
  /// digitação, e mandá-la à API seria gravar um provento com data inválida.
  static String? paraIso(String texto) {
    final partes = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$')
        .firstMatch(texto.trim());
    if (partes == null) return null;

    final dia = int.parse(partes[1]!);
    final mes = int.parse(partes[2]!);
    final ano = int.parse(partes[3]!);

    // `DateTime` aceita 32/13 e transborda para o mês seguinte; comparar os
    // componentes de volta é o que pega a data que não existe.
    final data = DateTime(ano, mes, dia);
    if (data.day != dia || data.month != mes || data.year != ano) return null;

    return '$ano-${'$mes'.padLeft(2, '0')}-${'$dia'.padLeft(2, '0')}';
  }

  /// Converte `YYYY-MM` para `MM/yyyy`.
  static String mesAno(String iso) {
    final data = DateTime.tryParse('$iso-01');
    return data == null ? iso : _mesAno.format(data);
  }
}
