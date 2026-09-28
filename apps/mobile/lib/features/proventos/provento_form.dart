import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/data.dart';
import '../../core/format/moeda.dart';
import '../../shared/components/campo_texto.dart';
import '../../shared/components/envio_de_formulario.dart';
import '../../shared/components/rodape_formulario.dart';

/// Criação e edição de provento (issue #403).
class ProventoForm extends StatefulWidget {
  const ProventoForm({
    super.key,
    required this.aoSalvar,
    this.proventoInicial,
    this.erro,
  });

  final Future<bool> Function(DividendCreateRequest) aoSalvar;
  final DividendResponse? proventoInicial;
  final String? erro;

  @override
  State<ProventoForm> createState() => _ProventoFormState();
}

class _ProventoFormState extends State<ProventoForm>
    with EnvioDeFormulario<ProventoForm> {
  final _formulario = GlobalKey<FormState>();

  late final _ticker = TextEditingController(
    text: widget.proventoInicial?.ticker,
  );
  late final _valorPorCota = TextEditingController(
    text: widget.proventoInicial == null
        ? ''
        : Moeda.exibirSemSimbolo(widget.proventoInicial!.amountPerShare),
  );
  late final _quantidade = TextEditingController(
    text: widget.proventoInicial == null
        ? ''
        : Moeda.exibirSemSimbolo(widget.proventoInicial!.quantity),
  );
  late final _data = TextEditingController(
    text: widget.proventoInicial == null
        ? ''
        : Data.diaMesAno(widget.proventoInicial!.paymentDate),
  );

  @override
  void dispose() {
    _ticker.dispose();
    _valorPorCota.dispose();
    _quantidade.dispose();
    _data.dispose();
    super.dispose();
  }

  Future<void> _salvar() => enviar(
    _formulario,
    () => widget.aoSalvar(
      DividendCreateRequest(
        ticker: _ticker.text.trim().toUpperCase(),
        amountPerShare: Moeda.interpretar(_valorPorCota.text)!,
        quantity: Moeda.interpretar(_quantidade.text)!,
        // A tela usa o padrão brasileiro; a API recebe `YYYY-MM-DD`.
        paymentDate: Data.paraIso(_data.text)!,
      ),
    ),
  );

  String? _validarData(String? valor) {
    final texto = (valor ?? '').trim();
    if (texto.isEmpty) return 'Informe a data de pagamento.';
    return Data.paraIso(texto) == null ? 'Data inválida.' : null;
  }

  String? _obrigatorioPositivo(String? valor, String rotulo) {
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
            chave: 'campo-valor-por-cota',
            rotulo: 'Valor por cota',
            controller: _valorPorCota,
            tecladoNumerico: true,
            dica: 'Use vírgula para os centavos.',
            validador: (valor) => _obrigatorioPositivo(valor, 'o valor'),
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-quantidade',
            rotulo: 'Quantidade',
            controller: _quantidade,
            tecladoNumerico: true,
            validador: (valor) => _obrigatorioPositivo(valor, 'a quantidade'),
          ),
          const SizedBox(height: 16),
          CampoTexto(
            chave: 'campo-data',
            rotulo: 'Data de pagamento',
            controller: _data,
            dica: 'dd/mm/aaaa',
            validador: _validarData,
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
