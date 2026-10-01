import 'package:flutter/material.dart';

import 'core/auth/auth_gate.dart';
import 'core/auth/auth_service.dart';
import 'core/data/cache_local.dart';
import 'core/data/dindin_api.dart';
import 'core/notificacoes/notificacoes_service.dart';
import 'core/assinatura/assinatura_service.dart';
import 'core/setup/setup_service.dart';
import 'core/theme/dindin_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/inicio/inicio_screen.dart';

/// Raiz do aplicativo.
class DinDinApp extends StatelessWidget {
  const DinDinApp({
    super.key,
    required this.auth,
    required this.tema,
    required this.api,
    required this.cache,
    required this.notificacoes,
    required this.setup,
    required this.assinatura,
    this.geladeiraInicial,
  });

  final AuthService auth;
  final ThemeController tema;
  final DinDinApi api;
  final CacheLocal cache;
  final NotificacoesService notificacoes;

  /// Carteira e geladeira padrão do usuário, garantidas antes da primeira
  /// tela (#440). Entra pelo gate, e não pela tela inicial, porque a tela já
  /// carrega as geladeiras ao montar.
  final SetupService setup;

  /// Status da assinatura, lido uma vez por sessão junto do provisionamento
  /// (#442).
  final AssinaturaService assinatura;

  /// Geladeira a abrir na entrada, quando o app subiu por um toque na
  /// notificação de preço-alvo (issue #408).
  final String? geladeiraInicial;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: tema,
      builder: (context, _) => MaterialApp(
        title: 'DinDin',
        // O produto é brasileiro e formata valor, percentual e data em pt-BR.
        // Fixar o locale evita que o app siga o idioma do aparelho e exiba
        // ponto decimal onde o usuário espera vírgula.
        locale: const Locale('pt', 'BR'),
        debugShowCheckedModeBanner: false,
        theme: DinDinTheme.claro,
        darkTheme: DinDinTheme.escuro,
        // O padrão é a preferência do sistema, e o celular é usado no escuro
        // com muito mais frequência que o desktop.
        themeMode: tema.modo,
        home: AuthGate(
          sessoes: auth.sessoes,
          aoAutenticar: (sessao) async {
            // O cache passa a ser deste usuário antes de qualquer tela o ler:
            // o que era do usuário anterior sai aqui (issue #498).
            await cache.vincularA(sessao.uid);

            // As duas leituras são do mesmo momento — entrar — e nenhuma
            // depende da outra, então vão juntas em vez de em série.
            await Future.wait([
              setup.garantirPadroes(sessao.uid),
              assinatura.carregar(),
            ]);
          },
          aoEncerrar: () => cache.vincularA(null),
          login: LoginScreen(
            aoEntrarComEmail: auth.entrarComEmail,
            aoEntrarComGoogle: auth.entrarComGoogle,
            aoCadastrar: auth.cadastrarComEmail,
          ),
          autenticado: InicioScreen(
            auth: auth,
            api: api,
            cache: cache,
            tema: tema,
            notificacoes: notificacoes,
            assinatura: assinatura,
            geladeiraInicial: geladeiraInicial,
          ),
        ),
      ),
    );
  }
}
