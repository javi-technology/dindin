# Firebase no app Flutter

Como configurar o `apps/mobile` para falar com o projeto `dindin-4e720`
(issue #400).

## Por que não está no repositório

`google-services.json` (Android) e `GoogleService-Info.plist` (iOS) trazem
identificadores do projeto e chave de API. Eles seguem a regra do projeto de
nunca versionar credencial, e estão no `.gitignore` — assim como o
`firebase_options.dart`, que o FlutterFire gera com o mesmo conteúdo.

Baixe-os do console a cada clone; não os cole em nenhum lugar versionado.

## Identificadores

Os dois aplicativos usam **`tech.javi.dindin`**:

| Plataforma | Onde                                                |
| ---------- | --------------------------------------------------- |
| Android    | `applicationId` e `namespace` no `build.gradle.kts` |
| iOS        | `PRODUCT_BUNDLE_IDENTIFIER` no projeto do Xcode     |

Os apps registrados no console precisam usar exatamente esse identificador.
Mudar um e esquecer o outro derruba o login com Google só numa plataforma, e
o erro que aparece (`sign_in_failed`) não diz qual.

## Passo a passo

1. **Console** → projeto `dindin-4e720` → _Adicionar app_, uma vez para
   Android e uma para iOS, com o identificador acima.
2. **Android**: baixe `google-services.json` para
   `apps/mobile/android/app/`.
3. **iOS**: baixe `GoogleService-Info.plist` e adicione-o ao target `Runner`
   pelo Xcode (arrastar para a pasta não basta: ele precisa estar em _Copy
   Bundle Resources_, ou o app sobe sem configuração e falha no
   `Firebase.initializeApp()`).
4. **SHA-1 e SHA-256** (Android): o login com Google não funciona sem eles.

   ```bash
   cd apps/mobile/android && ./gradlew signingReport
   ```

   Registre o SHA-1 **e** o SHA-256 de cada chave em uso — a de debug, para
   desenvolver, e a de release, quando a publicação existir (issue #407).
   Depois de adicionar um SHA, baixe o `google-services.json` de novo: ele
   muda.

5. **iOS**: copie o `REVERSED_CLIENT_ID` do `GoogleService-Info.plist` para
   um _URL scheme_ do target `Runner`. É por esse esquema que o Google
   devolve o resultado do login ao app.
6. **Auth** → _Sign-in method_: habilite **E-mail/senha** e **Google**.

## Apontar o app para os emuladores

O endereço da API é decidido em tempo de build e o padrão é produção:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:5001
```

No emulador de Android, `localhost` é o próprio aparelho virtual: use
`http://10.0.2.2:5001`.

## O que fica de fora

O app **não guarda token por conta própria**. O `firebase_auth` restaura a
sessão do disco na abertura e renova o ID token; token escrito à mão em
`SharedPreferences` vence sem aviso e não é renovável. Ver
`lib/core/auth/firebase_auth_backend.dart`.
