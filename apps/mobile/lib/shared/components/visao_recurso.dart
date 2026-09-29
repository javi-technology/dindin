import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/data/recurso.dart';
import '../../core/theme/dindin_tokens.dart';
import 'estado_carregando.dart';
import 'estado_erro.dart';

/// Carregando, vazio, erro e sucesso, num lugar só (issue #402).
///
/// Cada tela de consulta trata os mesmos quatro estados. Repetir isso cinco
/// vezes garante que uma delas esqueça a nova tentativa — e é justamente a
/// que o usuário vai abrir no metrô.
class VisaoRecurso<T> extends StatelessWidget {
  const VisaoRecurso({
    super.key,
    required this.estado,
    required this.aoRecarregar,
    required this.conteudo,
    this.vazio,
    this.estaVazio,
  });

  final EstadoDoRecurso<T> estado;
  final VoidCallback aoRecarregar;

  /// O conteúdo da tela, que **precisa ser rolável** (`ListView` e afins).
  ///
  /// É o que habilita o puxar-para-atualizar: no celular esse é o gesto que
  /// o usuário tenta antes de procurar um botão.
  final Widget Function(BuildContext, T) conteudo;

  /// O que mostrar quando não há nenhum item.
  final WidgetBuilder? vazio;

  /// Lista vazia e falha de carregamento são coisas diferentes, e precisam
  /// parecer diferentes: tratar as duas como tela em branco faz o usuário
  /// achar que perdeu dado quando só não cadastrou nada.
  final bool Function(T)? estaVazio;

  @override
  Widget build(BuildContext context) {
    final dados = estado.dados;

    if (dados == null) {
      if (estado.erro != null) {
        return EstadoErro(mensagem: estado.erro!, aoTentarDeNovo: aoRecarregar);
      }
      return const EstadoCarregando();
    }

    if (estaVazio?.call(dados) == true && vazio != null) {
      return vazio!(context);
    }

    // Com dado em mãos, o erro vira aviso em vez de tela: trocar o conteúdo
    // por uma mensagem apagaria justamente o que o usuário consegue usar
    // offline.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (estado.doCache) _AvisoDeCache(em: estado.atualizadoEm),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => aoRecarregar(),
            child: conteudo(context, dados),
          ),
        ),
      ],
    );
  }
}

/// Faixa que diz que o número na tela pode estar velho.
///
/// Sem ela, o cache seria uma armadilha: o usuário tomaria decisão financeira
/// sobre a cotação de ontem achando que é a de agora.
class _AvisoDeCache extends StatelessWidget {
  const _AvisoDeCache({this.em});

  final DateTime? em;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final quando = em == null
        ? ''
        // Padrão numérico de propósito: `DateFormat` com nome de locale
        // exige `initializeDateFormatting`, e dia/mês/hora não dependem de
        // dado de idioma — a ordem brasileira está no próprio padrão.
        : ' de ${DateFormat('dd/MM HH:mm').format(em!)}';

    return Container(
      key: const Key('aviso-cache'),
      width: double.infinity,
      color: t.warningSoft,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Icon(Icons.history, size: 18, color: t.warningInk),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Mostrando dados$quando. Atualizando…',
              style: TextStyle(color: t.warningInk, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
