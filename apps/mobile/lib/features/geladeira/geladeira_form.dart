import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../shared/components/campo_texto.dart';
import '../../shared/components/envio_de_formulario.dart';
import '../../shared/components/rodape_formulario.dart';

/// Criação e renomeação de geladeira (issue #444).
///
/// A #440 garante a Geladeira Principal a quem entra; este formulário é o que
/// permite ter uma segunda — ou renomear a que existe — sem abrir o site.
class GeladeiraForm extends StatefulWidget {
  const GeladeiraForm({
    super.key,
    required this.aoSalvar,
    this.nomeInicial,
    this.descricaoInicial,
    this.erro,
  });

  /// Devolve se o envio deu certo; `false` mantém o formulário aberto e
  /// preenchido, para o usuário não redigitar tudo no teclado do celular.
  final Future<bool> Function(CreateFridgeRequest) aoSalvar;

  final String? nomeInicial;
  final String? descricaoInicial;
  final String? erro;

  @override
  State<GeladeiraForm> createState() => _GeladeiraFormState();
}

class _GeladeiraFormState extends State<GeladeiraForm>
    with EnvioDeFormulario<GeladeiraForm> {
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
      // String vazia, e não `null`: `toJson` omite o nulo, e o backend
      // manteria a descrição anterior — limpar o campo não apagava nada.
      CreateFridgeRequest(
        name: _nome.text.trim(),
        description: _descricao.text.trim(),
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
