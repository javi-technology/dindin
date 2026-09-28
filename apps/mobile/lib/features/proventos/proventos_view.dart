import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/data/recurso.dart';
import '../../core/format/data.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/estado_vazio.dart';
import '../../shared/components/visao_recurso.dart';

/// Proventos já recebidos (issue #402).
class ProventosView extends StatelessWidget {
  const ProventosView({
    super.key,
    required this.estado,
    required this.aoRecarregar,
  });

  final EstadoDoRecurso<List<DividendResponse>> estado;
  final VoidCallback aoRecarregar;

  @override
  Widget build(BuildContext context) {
    return VisaoRecurso<List<DividendResponse>>(
      estado: estado,
      aoRecarregar: aoRecarregar,
      estaVazio: (proventos) => proventos.isEmpty,
      vazio: (_) => const EstadoVazio(
        titulo: 'Nenhum provento registrado',
        descricao: 'Os proventos recebidos aparecem aqui.',
        icone: Icons.payments_outlined,
      ),
      conteudo: (context, proventos) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: proventos.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final provento = proventos[i];
          final t = context.tokens;

          return Cartao(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        provento.ticker,
                        style: TextStyle(
                          color: t.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${Data.diaMesAno(provento.paymentDate)} · '
                        '${Moeda.exibirSemSimbolo(provento.quantity)} cotas',
                        style: TextStyle(color: t.textSecondary, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                Text(
                  Moeda.exibir(provento.totalAmount),
                  style: TextStyle(
                    color: t.positive,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
