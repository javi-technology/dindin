import 'package:intl/intl.dart';

/// Valores monetários e percentuais no padrão brasileiro (issue #401).
///
/// O teclado numérico do celular oferece a vírgula, então digitar `1,55` num
/// campo de preço é o caminho comum, não a exceção: recusar esse texto — ou
/// pior, lê-lo como `155` — é erro de dado financeiro.
abstract final class Moeda {
  static final _comSimbolo = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  static final _semSimbolo = NumberFormat('#,##0.00', 'pt_BR');
  static final _percentual = NumberFormat('#,##0.00', 'pt_BR');

  static String exibir(double valor) => _comSimbolo.format(valor);

  static String exibirSemSimbolo(double valor) => _semSimbolo.format(valor);

  /// Fração para percentual: `0,0855` vira `8,55%`.
  static String percentual(double fracao) =>
      '${_percentual.format(fracao * 100)}%';

  /// Lê o que o usuário digitou, ou `null` quando não é número.
  ///
  /// Devolver `null` em vez de zero é deliberado: num campo de preço, zero é
  /// um valor válido e não pode ser o resultado de um texto ilegível.
  static double? interpretar(String? texto) {
    if (texto == null) return null;

    // Símbolo de moeda, espaço comum e espaço não separável — este último
    // chega ao campo quando o usuário cola um valor já formatado.
    final limpo = texto.replaceAll(RegExp(r'[R$\s ]'), '').trim();

    if (limpo.isEmpty) return null;
    if (!RegExp(r'^-?[\d.,]+$').hasMatch(limpo)) return null;

    // Mais de uma vírgula não é número: `1,2,3` é erro de digitação, e
    // adivinhar qual delas é o decimal chutaria o valor de uma compra.
    final qtdVirgulas = RegExp(',').allMatches(limpo).length;
    if (qtdVirgulas > 1) return null;

    String normalizado;
    if (qtdVirgulas == 1) {
      // Com vírgula presente, ela é o decimal e o ponto é milhar.
      normalizado = limpo.replaceAll('.', '').replaceAll(',', '.');
    } else {
      normalizado = _semVirgula(limpo);
      if (normalizado.isEmpty) return null;
    }

    return double.tryParse(normalizado);
  }

  /// Texto só com pontos: decidir se o último é milhar ou decimal.
  ///
  /// `1.500` é mil e quinhentos no Brasil e um e meio em inglês. Com três
  /// casas depois do último ponto, a leitura brasileira é a única que faz
  /// sentido num campo de preço; com uma ou duas, é decimal.
  static String _semVirgula(String limpo) {
    final pontos = RegExp(r'\.').allMatches(limpo).length;
    if (pontos == 0) return limpo;

    final ultimo = limpo.split('.').last;

    if (pontos > 1 || ultimo.length == 3) {
      return limpo.replaceAll('.', '');
    }

    if (ultimo.length > 3) return '';

    return limpo;
  }
}
