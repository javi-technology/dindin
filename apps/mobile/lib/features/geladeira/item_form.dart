import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/moeda.dart';
import '../../shared/components/campo_texto.dart';
import '../../shared/components/envio_de_formulario.dart';
import '../../shared/components/rodape_formulario.dart';

/// Criação e edição de item da geladeira (issue #403).
class ItemForm extends StatefulWidget {
  const ItemForm({
    super.key,
    required this.aoSalvar,
    this.itemInicial,
    this.erro,
  });

  final Future<bool> Function(CreateFridgeItemRequest) aoSalvar;
  final FridgeItem? itemInicial;
  final String? erro;

  @override
  State<ItemForm> createState() => _ItemFormState();
}

class _ItemFormState extends State<ItemForm> with EnvioDeFormulario<ItemForm> {
  final _formulario = GlobalKey<FormState>();

  late final _ticker = TextEditingController(text: widget.itemInicial?.ticker);
  late final _quantidade = TextEditingController(
    text: widget.itemInicial == null
        ? ''
        : Moeda.exibirSemSimbolo(widget.itemInicial!.quantity),
  );
  late final _precoTransferencia = TextEditingController(
    text: widget.itemInicial == null
        ? ''
        : Moeda.exibirSemSimbolo(widget.itemInicial!.transferredPrice),
  );
  late final _precoAlvo = TextEditingController(
    text: widget.itemInicial == null
        ? ''
        : Moeda.exibirSemSimbolo(widget.itemInicial!.targetPrice),
  );

  @override
  void dispose() {
    _ticker.dispose();
    _quantidade.dispose();
    _precoTransferencia.dispose();
    _precoAlvo.dispose();
    super.dispose();
  }

  Future<void> _salvar() => enviar(
    _formulario,
    () => widget.aoSalvar(
      CreateFridgeItemRequest(
        ticker: _ticker.text.trim().toUpperCase(),
        quantity: Moeda.interpretar(_quantidade.text)!,
        transferredPrice: Moeda.interpretar(_precoTransferencia.text)!,
        targetPrice: Moeda.interpretar(_precoAlvo.text)!,
      ),
    ),
  );

  String? _positivo(String? valor, String rotulo) {
    final numero = Moeda.interpretar(valor);
    if (numero == null) return 'Informe $rotulo.';
    if (numero <= 0) return 'O valor precisa ser maior que zero.';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formulario,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CampoTexto(
            chave: 'campo-ticker',
            rotulo: 'Ticker',
            controller: _ticker,
            maiusculas: true,
            validador: (valor) =>
                (valor ?? '').trim().isEmpty ? 'Informe o ticker.' : null,
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-quantidade',
            rotulo: 'Quantidade',
            controller: _quantidade,
            tecladoNumerico: true,
            validador: (valor) => _positivo(valor, 'a quantidade'),
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-preco-transferencia',
            rotulo: 'Preço de transferência',
            controller: _precoTransferencia,
            tecladoNumerico: true,
            dica: 'Use vírgula para os centavos.',
            validador: (valor) => _positivo(valor, 'o preço'),
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-preco-alvo',
            rotulo: 'Preço-alvo',
            controller: _precoAlvo,
            tecladoNumerico: true,
            dica: 'Preço em que você quer comprar.',
            validador: (valor) => _positivo(valor, 'o preço-alvo'),
          ),
          const SizedBox(height: 24),
          RodapeFormulario(
            enviando: enviando,
            erro: widget.erro,
            aoSalvar: _salvar,
          ),
        ],
      ),
    );
  }
}
