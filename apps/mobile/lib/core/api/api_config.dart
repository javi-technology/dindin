/// Host compartilhado pelos emuladores Firebase quando o app roda localmente.
///
/// No simulador iOS, use `127.0.0.1`; em aparelho físico, use o IP da máquina
/// na rede local. Ausente por padrão para que um build publicado nunca aponte
/// acidentalmente para um computador de desenvolvimento.
const String firebaseEmulatorHost = String.fromEnvironment(
  'FIREBASE_EMULATOR_HOST',
);

const String _apiBaseUrlDefinida = String.fromEnvironment('API_BASE_URL');

/// Monta a URL do Hosting emulator, que mantém o rewrite `/api` igual ao da
/// produção. Chamar a Functions diretamente exigiria incluir projeto, região e
/// nome da function na URL.
String apiBaseUrlDoEmulador(String host) => 'http://$host:5002';

/// Endereço da API, escolhido em tempo de build.
///
/// `API_BASE_URL` permite uma API arbitrária. Para desenvolvimento local,
/// `FIREBASE_EMULATOR_HOST` configura API e Firebase Auth com o mesmo host.
String get apiBaseUrl {
  if (_apiBaseUrlDefinida.isNotEmpty) return _apiBaseUrlDefinida;
  if (firebaseEmulatorHost.isNotEmpty) {
    return apiBaseUrlDoEmulador(firebaseEmulatorHost);
  }
  return 'https://dindin-4e720.web.app';
}

/// Liga a compra in-app (issue #405).
///
/// Desligada por padrão: enquanto o backend não tem os validadores de recibo
/// das lojas configurados, toda compra responde 503. Oferecer o botão assim
/// deixaria o usuário pagar na loja e ficar sem acesso. Liga-se no build com
/// `--dart-define=COMPRA_IN_APP=true`, depois de cumprida a seção "Compra
/// in-app" de `docs/mobile-release.md`.
const bool compraInAppHabilitada = bool.fromEnvironment('COMPRA_IN_APP');
