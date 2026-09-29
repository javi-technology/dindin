import 'package:flutter/foundation.dart';

import '../api/api_exception.dart';

/// Uma operação de escrita em andamento (issue #403).
///
/// Escrita no celular falha de formas que a web quase não vê: a rede cai no
/// meio do envio e o usuário toca no botão duas vezes achando que não
/// funcionou. Sem tratamento, isso vira posição duplicada — erro de dado
/// financeiro, não incômodo de interface.
class Envio extends ChangeNotifier {
  bool _enviando = false;
  String? _erro;

  bool get enviando => _enviando;

  /// Mensagem já pronta para a tela, em português.
  String? get erro => _erro;

  /// Executa [acao] e devolve se ela deu certo.
  ///
  /// Enquanto houver um envio em andamento, uma nova chamada é **recusada** e
  /// devolve `false` sem executar nada: é o que impede o toque duplo de virar
  /// dois registros.
  Future<bool> executar(Future<void> Function() acao) async {
    if (_enviando) return false;

    _enviando = true;
    _erro = null;
    notifyListeners();

    try {
      await acao();
      return true;
    } catch (erro) {
      _erro = _mensagem(erro);
      return false;
    } finally {
      // O envio volta a ficar disponível mesmo na falha: o formulário segue
      // preenchido, e o usuário tenta de novo sem redigitar tudo no teclado
      // do celular — que é onde ele desiste.
      _enviando = false;
      notifyListeners();
    }
  }

  static String _mensagem(Object erro) => switch (erro) {
    NetworkException(:final message) => message,
    ApiException(:final message) => message,
    // Erro fora do previsto não vaza detalhe interno para a tela: o texto do
    // `StateError` não diz nada ao usuário e ainda expõe o de dentro.
    _ => 'Não foi possível salvar. Tente de novo.',
  };
}
