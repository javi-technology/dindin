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

## Notificações push no iOS

O app pode abrir sem token APNs, mas só recebe push no iOS depois que o
registro com a Apple e o FCM estiver configurado:

1. Abra `apps/mobile/ios/Runner.xcworkspace` no Xcode. No target `Runner`, em
   _Signing & Capabilities_, selecione a equipe Apple e adicione **Push
   Notifications**.
2. Adicione **Background Modes** e marque **Background fetch** e **Remote
   notifications**.
3. No Firebase Console, em _Project settings → Cloud Messaging_, envie uma
   chave de autenticação APNs (`.p8`) com o _Key ID_ e o _Team ID_ da equipe.
4. Conceda a permissão de notificações na geladeira do app e valide a entrega
   em um dispositivo iOS configurado para receber push.

O `firebase_messaging` usa o _method swizzling_ para associar o token APNs ao
token FCM; não desative `FirebaseAppDelegateProxyEnabled` no `Info.plist`.
Se o APNs ainda não estiver disponível na abertura, o app continua iniciando
e o registro de push é tentado novamente quando o FCM renovar o token ou na
próxima abertura.

## Apontar o app para os emuladores

Com os emuladores ativos na raiz do repositório, um único define aponta a API
(via Hosting, porta `5002`) e o Firebase Auth (porta `9099`) para a mesma
máquina. Assim, o token usado nas requisições é aceito pelo Functions emulator:

```bash
firebase emulators:start
```

Em outro terminal, para o simulador iOS:

```bash
cd apps/mobile
flutter run --dart-define=FIREBASE_EMULATOR_HOST=127.0.0.1
```

No emulador Android, use `10.0.2.2`; em um aparelho físico, use o IP local do
Mac (por exemplo, o resultado de `ipconfig getifaddr en0`):

```bash
flutter run --dart-define=FIREBASE_EMULATOR_HOST=192.168.1.20
```

`API_BASE_URL` continua disponível para apontar somente a API a outro ambiente,
mas não configura o Firebase Auth e, portanto, não é o comando adequado para
os emuladores.

## O que fica de fora

O app **não guarda token por conta própria**. O `firebase_auth` restaura a
sessão do disco na abertura e renova o ID token; token escrito à mão em
`SharedPreferences` vence sem aviso e não é renovável. Ver
`lib/core/auth/firebase_auth_backend.dart`.
