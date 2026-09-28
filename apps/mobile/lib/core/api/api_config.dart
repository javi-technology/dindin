/// Endereço da API, escolhido em tempo de build.
///
/// `--dart-define=API_BASE_URL=...` aponta o app para os emuladores sem
/// alterar código. O padrão é produção, porque é o que vale no aparelho do
/// usuário — um app publicado apontando para `localhost` não fala com nada.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://dindin-4e720.web.app',
);
