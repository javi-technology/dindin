import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/data.dart';
import '../../core/format/moeda.dart';
import '../../shared/components/campo_texto.dart';
import '../../shared/components/envio_de_formulario.dart';
import '../../shared/components/rodape_formulario.dart';

/// Parâmetros da simulação geral (issue #404).
///
/// Valor a investir, horizonte e modo de reinvestimento — **liberada sem
/// assinatura**, ao contrário da simulação por ativo específico.
class SimulacaoForm extends StatefulWidget {
  const SimulacaoForm({
    super.key,
    required this.carteiras,
    required this.aoSimular,
    this.erro,
  });

  final List<SimulationWalletOption> carteiras;
  final Future<bool> Function(WalletSimulationRequest) aoSimular;
  final String? erro;

  @override
  State<SimulacaoForm> createState() => _SimulacaoFormState();
}

class _SimulacaoFormState extends State<SimulacaoForm>
    with EnvioDeFormulario<SimulacaoForm> {
  static const _horizontes = [6, 12, 24, 36, 60];

  final _formulario = GlobalKey<FormState>();
  final _valor = TextEditingController();

  late SimulationWalletOption? _carteira = widget.carteiras.firstOrNull;
  late String? _mes = _carteira?.months.firstOrNull;
  int _meses = 12;
  SimulationMode _modo = SimulationMode.reinvest;
  AiSuggestionTab _aba = AiSuggestionTab.renda;

  @override
  void dispose() {
    _valor.dispose();
    super.dispose();
  }

  Future<void> _simular() => enviar(
    _formulario,
    () => widget.aoSimular(
      WalletSimulationRequest(
        // O texto vai como foi digitado: a API converte pt-BR, e converter
        // dos dois lados é convidar os dois a discordarem sobre `1.500`.
        amount: _valor.text.trim(),
        months: _meses,
        mode: _modo,
        provider: _carteira?.slug,
        month: _mes,
        tab: _aba,
      ),
    ),
  );

  String? _validarValor(String? texto) {
    final valor = Moeda.interpretar(texto);
    if (valor == null) return 'Informe o valor.';
    if (valor <= 0) return 'O valor precisa ser maior que zero.';
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
            chave: 'campo-valor',
            rotulo: 'Quanto pretende investir',
            controller: _valor,
            tecladoNumerico: true,
            dica: 'Use vírgula para os centavos.',
            validador: _validarValor,
          ),
          const SizedBox(height: 16),
          // Só aparece com mais de uma carteira: perguntar qual, havendo uma
          // só, é um toque a mais sem escolha nenhuma.
          if (widget.carteiras.length > 1) ...[
            DropdownButtonFormField<SimulationWalletOption>(
              key: const Key('campo-carteira'),
              initialValue: _carteira,
              decoration: const InputDecoration(labelText: 'Carteira sugerida'),
              items: [
                for (final opcao in widget.carteiras)
                  DropdownMenuItem(value: opcao, child: Text(opcao.label)),
              ],
              onChanged: (opcao) => setState(() {
                _carteira = opcao;
                _mes = opcao?.months.firstOrNull;
              }),
            ),
            const SizedBox(height: 16),
          ],
          if ((_carteira?.months.length ?? 0) > 1) ...[
            DropdownButtonFormField<String>(
              key: const Key('campo-mes'),
              initialValue: _mes,
              decoration: const InputDecoration(labelText: 'Mês da carteira'),
              items: [
                for (final mes in _carteira!.months)
                  DropdownMenuItem(value: mes, child: Text(Data.mesAno(mes))),
              ],
              onChanged: (mes) => setState(() => _mes = mes),
            ),
            const SizedBox(height: 16),
          ],
          DropdownButtonFormField<int>(
            key: const Key('campo-horizonte'),
            initialValue: _meses,
            decoration: const InputDecoration(labelText: 'Por quanto tempo'),
            items: [
              for (final meses in _horizontes)
                DropdownMenuItem(value: meses, child: Text('$meses meses')),
            ],
            onChanged: (meses) => setState(() => _meses = meses ?? _meses),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<AiSuggestionTab>(
            key: const Key('campo-aba'),
            initialValue: _aba,
            decoration: const InputDecoration(labelText: 'Perfil da carteira'),
            items: const [
              DropdownMenuItem(
                value: AiSuggestionTab.renda,
                child: Text('Renda'),
              ),
              DropdownMenuItem(
                value: AiSuggestionTab.ganho,
                child: Text('Ganho de capital'),
              ),
            ],
            onChanged: (aba) => setState(() => _aba = aba ?? _aba),
          ),
          const SizedBox(height: 16),
          SegmentedButton<SimulationMode>(
            key: const Key('campo-modo'),
            segments: const [
              ButtonSegment(
                value: SimulationMode.reinvest,
                label: Text('Reinvestir'),
              ),
              ButtonSegment(
                value: SimulationMode.withdraw,
                label: Text('Sacar'),
              ),
            ],
            selected: {_modo},
            onSelectionChanged: (escolha) =>
                setState(() => _modo = escolha.first),
          ),
          const SizedBox(height: 24),
          RodapeFormulario(
            enviando: enviando,
            erro: widget.erro,
            aoSalvar: _simular,
            rotulo: 'Simular',
            chaveDoBotao: const Key('botao-simular'),
          ),
        ],
      ),
    );
  }
}
