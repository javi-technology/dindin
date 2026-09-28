import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/format/moeda.dart';

// ---------------------------------------------------------------------------
// Valores no padrão brasileiro (issue #401).
//
// Campo de preço aceita vírgula como separador decimal: quem digita `1,55`
// num app financeiro não espera que vire `155` nem que seja recusado. O
// teclado numérico do celular oferece a vírgula, então este é o caminho
// comum, não a exceção.
// ---------------------------------------------------------------------------
void main() {
  group('interpretar', () {
    test('aceita vírgula decimal', () {
      expect(Moeda.interpretar('1,55'), 1.55);
      expect(Moeda.interpretar('0,95'), 0.95);
    });

    test('aceita ponto decimal', () {
      expect(Moeda.interpretar('1.55'), 1.55);
    });

    test('aceita separador de milhar com vírgula decimal', () {
      expect(Moeda.interpretar('1.500,55'), 1500.55);
      expect(Moeda.interpretar('1.234.567,89'), 1234567.89);
    });

    test('aceita inteiro', () {
      expect(Moeda.interpretar('42'), 42.0);
    });

    test('ignora espaço e símbolo de moeda', () {
      expect(Moeda.interpretar(' R\$ 1.500,55 '), 1500.55);
    });

    test('devolve nulo para texto vazio ou inválido', () {
      expect(Moeda.interpretar(''), isNull);
      expect(Moeda.interpretar('   '), isNull);
      expect(Moeda.interpretar('abc'), isNull);
      expect(Moeda.interpretar('1,2,3'), isNull);
    });

    // Um ponto sozinho é ambíguo: `1.500` é mil e quinhentos no Brasil e um
    // e meio em inglês. Com três casas depois do ponto e nenhuma vírgula, a
    // leitura brasileira é a única que faz sentido num campo de preço.
    test('lê ponto com três casas como milhar', () {
      expect(Moeda.interpretar('1.500'), 1500.0);
    });

    test('lê ponto com duas casas como decimal', () {
      expect(Moeda.interpretar('1.50'), 1.5);
    });
  });

  group('exibir', () {
    // O separador entre o símbolo e o número é espaço **não separável**: com
    // espaço comum, "R$" e o valor podem cair em linhas diferentes num
    // cartão estreito de celular.
    const nbsp = '\u00A0';

    test('formata no padrão brasileiro', () {
      expect(Moeda.exibir(1500.55), 'R\$${nbsp}1.500,55');
      expect(Moeda.exibir(0.95), 'R\$${nbsp}0,95');
    });

    test('arredonda para duas casas', () {
      expect(Moeda.exibir(1.5551), 'R\$${nbsp}1,56');
    });

    test('formata negativo', () {
      expect(Moeda.exibir(-42.5), '-R\$${nbsp}42,50');
    });

    test('sem símbolo quando pedido', () {
      expect(Moeda.exibirSemSimbolo(1500.55), '1.500,55');
    });
  });

  group('percentual', () {
    test('formata com duas casas e vírgula', () {
      expect(Moeda.percentual(0.0855), '8,55%');
    });

    test('formata zero', () {
      expect(Moeda.percentual(0), '0,00%');
    });
  });

  group('ida e volta', () {
    test('o que é exibido volta a ser lido', () {
      for (final valor in [0.95, 1.55, 1500.55, 1234567.89]) {
        expect(Moeda.interpretar(Moeda.exibir(valor)), valor);
      }
    });
  });
}
