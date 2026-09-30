import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';

/// Campo de ticker com sugestões do catálogo (issue #443).
///
/// A API recusa ticker fora do catálogo, e antes disto o erro só voltava
/// depois do envio — no teclado do celular, errar o ticker é fácil e a
/// correção custava uma ida e volta à rede.
///
/// Com o catálogo em mãos, só ativo dele vale (issue #467), como no select
/// fechado do web: o erro aparece no campo, antes do envio. Sem ele — sem rede
/// e sem cache — o campo continua aceitando o que o usuário digitar, porque um
/// formulário que trava por falta de lista é pior que um erro da API.
class CampoAtivo extends StatelessWidget {
  const CampoAtivo({
    super.key,
    required this.controller,
    required this.catalogo,
    this.aoEscolher,
    this.tickerAtual,
  });

  final TextEditingController controller;
  final List<Asset> catalogo;

  /// Avisa qual ativo foi escolhido, para o formulário preencher o tipo.
  final ValueChanged<Asset>? aoEscolher;

  /// Ticker já gravado, na edição. Continua valendo mesmo que saia do
  /// catálogo: bloquear a correção da quantidade de uma posição antiga por
  /// causa do ticker que o usuário nem está mexendo seria um beco.
  final String? tickerAtual;

  Asset? _doCatalogo(String texto) {
    final ticker = texto.trim().toUpperCase();
    for (final ativo in catalogo) {
      if (ativo.ticker.toUpperCase() == ticker) return ativo;
    }
    return null;
  }

  String? _validar(String? valor) {
    final texto = (valor ?? '').trim();
    if (texto.isEmpty) return 'Informe o ticker.';
    if (catalogo.isEmpty) return null;
    if (_doCatalogo(texto) != null) return null;
    if (texto.toUpperCase() == tickerAtual?.toUpperCase()) return null;
    return 'Escolha um ativo da lista.';
  }

  /// Ativos cujo ticker ou nome contêm o texto digitado.
  ///
  /// O nome entra na busca porque nem todo mundo lembra o ticker de cabeça,
  /// e "itaú" é o que a pessoa tem em mente ao procurar ITUB4.
  Iterable<Asset> _sugestoes(String texto) {
    final busca = texto.trim().toLowerCase();
    // Campo vazio lista tudo: é o select do web, e quem não lembra o ticker
    // precisa enxergar as opções antes de digitar.
    if (busca.isEmpty) return catalogo;

    return catalogo.where(
      (ativo) =>
          ativo.ticker.toLowerCase().contains(busca) ||
          ativo.name.toLowerCase().contains(busca),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Autocomplete<Asset>(
      optionsBuilder: (valor) => _sugestoes(valor.text),
      displayStringForOption: (ativo) => ativo.ticker,
      onSelected: (ativo) {
        controller.text = ativo.ticker;
        aoEscolher?.call(ativo);
      },
      fieldViewBuilder: (context, textController, focusNode, aoEnviar) {
        // O Autocomplete mantém o próprio controller e é ele que o campo usa;
        // o do formulário só precisa espelhar o texto para o `aoSalvar`.
        //
        // Copiar o `value` inteiro a cada `build` — como esta função fazia —
        // reescreve também a seleção e joga o cursor para o fim: corrigir uma
        // letra no meio do ticker ficava impossível. Sincronizar só quando o
        // texto de fato difere preserva onde o usuário deixou o cursor.
        if (textController.text != controller.text) {
          textController.value = TextEditingValue(
            text: controller.text,
            selection: TextSelection.collapsed(offset: controller.text.length),
          );
        }

        return TextFormField(
          key: const Key('campo-ticker'),
          controller: textController,
          focusNode: focusNode,
          decoration: const InputDecoration(labelText: 'Ticker'),
          textCapitalization: TextCapitalization.characters,
          // Sem escolher nada na lista, é isto que leva o texto ao formulário.
          onChanged: (texto) {
            controller.text = texto;
            // Ticker digitado por inteiro também traz o tipo, sem exigir o
            // toque na sugestão.
            final ativo = _doCatalogo(texto);
            if (ativo != null) aoEscolher?.call(ativo);
          },
          validator: _validar,
        );
      },
      optionsViewBuilder: (context, aoSelecionar, sugestoes) => Align(
        alignment: Alignment.topLeft,
        child: Material(
          elevation: 4,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: ListView(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              children: [
                for (final ativo in sugestoes)
                  ListTile(
                    title: Text(ativo.ticker),
                    subtitle: Text(ativo.name),
                    onTap: () => aoSelecionar(ativo),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
