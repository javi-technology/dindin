import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../shared/components/campo_texto.dart';
import '../../shared/components/envio_de_formulario.dart';
import '../../shared/components/rodape_formulario.dart';

/// Criação e edição de carteira (issue #403).
class CarteiraForm extends StatefulWidget {
  const CarteiraForm({
    super.key,
    required this.aoSalvar,
    this.nomeInicial,
    this.descricaoInicial,
    this.erro,
  });

  /// Devolve se o envio deu certo; `false` mantém o formulário aberto e
  /// preenchido, para o usuário não redigitar tudo no teclado do celular.
  final Future<bool> Function(CreateWalletRequest) aoSalvar;

  final String? nomeInicial;
  final String? descricaoInicial;
  final String? erro;

  @override
  State<CarteiraForm> createState() => _CarteiraFormState();
}

class _CarteiraFormState extends State<CarteiraForm>
    with EnvioDeFormulario<CarteiraForm> {
  final _formulario = GlobalKey<FormState>();
  late final _nome = TextEditingController(text: widget.nomeInicial);
  late final _descricao = TextEditingController(text: widget.descricaoInicial);

  @override
  void dispose() {
    _nome.dispose();
    _descricao.dispose();
    super.dispose();
  }

  Future<void> _salvar() => enviar(
    _formulario,
    () => widget.aoSalvar(
      CreateWalletRequest(
        name: _nome.text.trim(),
        // BRL-only por decisão de produto (#266): não há seletor de moeda
        // para o usuário errar.
        currency: 'BRL',
        description: _descricao.text.trim().isEmpty
            ? null
            : _descricao.text.trim(),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formulario,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CampoTexto(
            chave: 'campo-nome',
            rotulo: 'Nome',
            controller: _nome,
            validador: (valor) =>
                (valor ?? '').trim().isEmpty ? 'Informe o nome.' : null,
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-descricao',
            rotulo: 'Descrição (opcional)',
            controller: _descricao,
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
