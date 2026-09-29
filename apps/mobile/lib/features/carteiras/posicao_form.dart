import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/moeda.dart';
import '../../shared/components/campo_ativo.dart';
import '../../shared/components/campo_texto.dart';
import '../../shared/components/envio_de_formulario.dart';
import '../../shared/components/rodape_formulario.dart';

/// Criação e edição de posição (issue #403).
///
/// Este é o formulário que o usuário abre logo depois de operar pelo home
/// broker, longe do computador: validar antes de enviar e não perder o que
/// foi digitado é o que decide se ele registra a compra ou deixa para depois.
class PosicaoForm extends StatefulWidget {
  const PosicaoForm({
    super.key,
    required this.aoSalvar,
    this.catalogo = const [],
    this.posicaoInicial,
    this.erro,
  });

  /// Devolve se o envio deu certo; `false` mantém o formulário preenchido.
  final Future<bool> Function(CreatePositionRequest) aoSalvar;

  /// Ativos do catálogo, para sugerir o ticker (#443). Vazio sem rede nem
  /// cache, e aí o campo segue aceitando digitação.
  final List<Asset> catalogo;

  final Position? posicaoInicial;
  final String? erro;

  @override
  State<PosicaoForm> createState() => _PosicaoFormState();
}

class _PosicaoFormState extends State<PosicaoForm>
    with EnvioDeFormulario<PosicaoForm> {
  final _formulario = GlobalKey<FormState>();

  late final _ticker = TextEditingController(
    text: widget.posicaoInicial?.ticker,
  );
  late final _quantidade = TextEditingController(
    text: widget.posicaoInicial == null
        ? ''
        : Moeda.exibirSemSimbolo(widget.posicaoInicial!.quantity),
  );
  late final _preco = TextEditingController(
    text: widget.posicaoInicial == null
        ? ''
        : Moeda.exibirSemSimbolo(widget.posicaoInicial!.averagePrice),
  );

  late AssetType _tipo = widget.posicaoInicial?.assetType ?? AssetType.fii;

  @override
  void dispose() {
    _ticker.dispose();
    _quantidade.dispose();
    _preco.dispose();
    super.dispose();
  }

  Future<void> _salvar() => enviar(
    _formulario,
    () => widget.aoSalvar(
      CreatePositionRequest(
        // A API trata o ticker em maiúsculas; exigir isso do usuário no
        // teclado do celular é pedir erro de digitação.
        ticker: _ticker.text.trim().toUpperCase(),
        assetType: _tipo,
        quantity: Moeda.interpretar(_quantidade.text)!,
        averagePrice: Moeda.interpretar(_preco.text)!,
      ),
    ),
  );

  String? _validarQuantidade(String? valor) {
    final numero = Moeda.interpretar(valor);
    if (numero == null) return 'Informe a quantidade.';
    if (numero <= 0) return 'A quantidade precisa ser maior que zero.';
    return null;
  }

  String? _validarPreco(String? valor) {
    final numero = Moeda.interpretar(valor);
    if (numero == null) return 'Informe o preço médio.';
    if (numero <= 0) return 'O preço precisa ser maior que zero.';
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
          CampoAtivo(
            controller: _ticker,
            catalogo: widget.catalogo,
            // O tipo vem junto do ativo escolhido: pedir que o usuário o
            // repita é convite a registrar FII como ação.
            aoEscolher: (ativo) => setState(() => _tipo = ativo.assetType),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<AssetType>(
            key: const Key('campo-tipo'),
            initialValue: _tipo,
            decoration: const InputDecoration(labelText: 'Tipo de ativo'),
            items: [
              for (final tipo in AssetType.values)
                DropdownMenuItem(value: tipo, child: Text(tipo.wire)),
            ],
            onChanged: (tipo) => setState(() => _tipo = tipo ?? _tipo),
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-quantidade',
            rotulo: 'Quantidade',
            controller: _quantidade,
            tecladoNumerico: true,
            validador: _validarQuantidade,
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-preco',
            rotulo: 'Preço médio',
            controller: _preco,
            tecladoNumerico: true,
            dica: 'Use vírgula para os centavos.',
            validador: _validarPreco,
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
