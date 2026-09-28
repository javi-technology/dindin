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

  /// Converte `YYYY-MM` para `MM/yyyy`.
  static String mesAno(String iso) {
    final data = DateTime.tryParse('$iso-01');
    return data == null ? iso : _mesAno.format(data);
  }
}
