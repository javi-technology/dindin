import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';

/// Campo de ticker com sugestões do catálogo (issue #443).
///
/// A API recusa ticker fora do catálogo, e antes disto o erro só voltava
/// depois do envio — no teclado do celular, errar o ticker é fácil e a
/// correção custava uma ida e volta à rede.
///
/// O catálogo é **ajuda, não barreira**: sem ele em mãos — sem rede e sem
/// cache — o campo continua aceitando o que o usuário digitar, porque um
/// formulário que trava por falta de lista é pior que um erro da API.
class CampoAtivo extends StatelessWidget {
  const CampoAtivo({
    super.key,
    required this.controller,
    required this.catalogo,
    this.aoEscolher,
  });

  final TextEditingController controller;
  final List<Asset> catalogo;

  /// Avisa qual ativo foi escolhido, para o formulário preencher o tipo.
  final ValueChanged<Asset>? aoEscolher;

  /// Ativos cujo ticker ou nome contêm o texto digitado.
  ///
  /// O nome entra na busca porque nem todo mundo lembra o ticker de cabeça,
  /// e "itaú" é o que a pessoa tem em mente ao procurar ITUB4.
  Iterable<Asset> _sugestoes(String texto) {
    final busca = texto.trim().toLowerCase();
    if (busca.isEmpty) return const [];

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
        // O Autocomplete mantém o próprio controller; o do formulário é a
        // fonte da verdade, e os dois precisam andar juntos para o texto
        // digitado valer mesmo sem nenhuma escolha na lista.
        textController.value = controller.value;
        textController.addListener(() => controller.text = textController.text);

        return TextFormField(
          key: const Key('campo-ticker'),
          controller: textController,
          focusNode: focusNode,
          decoration: const InputDecoration(labelText: 'Ticker'),
          textCapitalization: TextCapitalization.characters,
          validator: (valor) =>
              (valor ?? '').trim().isEmpty ? 'Informe o ticker.' : null,
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
