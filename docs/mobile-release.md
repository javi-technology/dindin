# Release do app mobile

Como o DinDin chega às lojas: build assinado, canal de teste e envio para
revisão (issue #407). O workflow é `.github/workflows/mobile-release.yml`.
Contas, registro dos apps e material de loja estão em
`docs/publicacao-lojas.md`.

## Como funciona

1. O deploy da `main` cria a tag `vX.Y.Z` (job `deploy` do `ci-cd.yml`).
2. **Actions → Mobile Release → Run workflow**, informando essa tag.
3. Um revisor aprova o ambiente `mobile-release`; só então os secrets ficam
   disponíveis aos jobs.
4. Os jobs `android` e `ios` constroem, assinam e enviam:
   - Android → Google Play, faixa **interna**;
   - iOS → **TestFlight**.

O workflow é manual de propósito: não roda em push nem em PR, e nunca publica
em produção. A publicação pública é um passo humano no console de cada loja,
depois da revisão.

## Versão rastreável

| Campo                                               | Origem                          |
| --------------------------------------------------- | ------------------------------- |
| Nome (`versionName` / `CFBundleShortVersionString`) | a tag, sem o `v` (`1.4.0`)      |
| Número (`versionCode` / `CFBundleVersion`)          | `github.run_number` da execução |

O build sai do commit da tag. Para descobrir de onde veio o que está na loja:
o nome leva à tag (`git rev-list -n1 v1.4.0`), e o número leva à execução do
workflow, que registra o commit. O número só cresce, como as lojas exigem — por
isso ele não é derivado da versão semântica, que pode ser publicada de novo
após uma correção.

A `pubspec.yaml` continua com `1.0.0+1` como valor de desenvolvimento: no
release, `--build-name` e `--build-number` prevalecem.

## Secrets e variáveis

Configure-os no ambiente `mobile-release` (Settings → Environments), com
revisão obrigatória.

| Nome                               | Tipo     | O que é                                            |
| ---------------------------------- | -------- | -------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`          | secret   | keystore de release, em base64 (`base64 -i x.jks`) |
| `ANDROID_KEYSTORE_PASSWORD`        | secret   | senha da keystore                                  |
| `ANDROID_KEY_ALIAS`                | secret   | alias da chave                                     |
| `ANDROID_KEY_PASSWORD`             | secret   | senha da chave                                     |
| `PLAY_SERVICE_ACCOUNT_JSON`        | secret   | conta de serviço com acesso ao app no Play Console |
| `GOOGLE_SERVICES_JSON_BASE64`      | secret   | `google-services.json`, em base64                  |
| `IOS_CERTIFICATE_BASE64`           | secret   | certificado de distribuição `.p12`, em base64      |
| `IOS_CERTIFICATE_PASSWORD`         | secret   | senha do `.p12`                                    |
| `IOS_PROVISIONING_PROFILE_BASE64`  | secret   | perfil App Store de `tech.javi.dindin`, em base64  |
| `GOOGLE_SERVICE_INFO_PLIST_BASE64` | secret   | `GoogleService-Info.plist`, em base64              |
| `APP_STORE_CONNECT_KEY_ID`         | secret   | id da chave de API da App Store Connect            |
| `APP_STORE_CONNECT_ISSUER_ID`      | secret   | issuer da chave de API                             |
| `APP_STORE_CONNECT_API_KEY`        | secret   | conteúdo do `.p8` da chave de API                  |
| `IOS_TEAM_ID`                      | variável | Team ID da conta Apple (não é credencial)          |

O workflow confere todos antes de construir e falha com `::error::` dizendo
qual falta. Nenhum é impresso no log, e a keystore, o certificado, o perfil e
a chave de API são apagados do runner ao fim, mesmo em falha.

Para obter cada um, siga `docs/mobile-firebase.md` (arquivos do Firebase) e
`docs/publicacao-lojas.md` (contas). Nunca commite `key.properties`,
`*.jks`, `*.keystore`, `*.p12`, `*.p8` ou `*.mobileprovision`: estão no
`.gitignore` do app, e a suíte da API confere isso.

Registre também o SHA-1 e o SHA-256 da chave de **release** no Firebase
(`docs/mobile-firebase.md`, passo 4), ou o login com Google falha no app da
loja. Se a Play App Signing estiver ativa, registre também os da chave de
assinatura do app que o Play Console mostra.

## Resguardo da keystore do Android

**Perder a keystore de upload impede publicar atualização do mesmo aplicativo.**
Por isso:

- Ative a **Play App Signing** na primeira publicação: o Google guarda a chave
  de assinatura do app, e a que fica conosco passa a ser só a de _upload_, que
  pode ser redefinida pelo suporte. Sem isso, perder o arquivo é definitivo.
- Gere a keystore uma única vez, localmente, com
  `keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`.
- Guarde o `.jks` e as duas senhas em **dois lugares independentes** — o
  gerenciador de senhas da empresa e um cofre offline —, nunca só nos secrets
  do GitHub: secret não pode ser lido de volta.
- Responsável: **a definir** (preencher: nome, e-mail e substituto). Quem tem
  acesso ao cofre: **a definir**. Ao trocar de responsável, revise o acesso ao
  cofre, ao ambiente `mobile-release` e ao Play Console no mesmo dia.
- Não guarde a keystore no repositório, em e-mail nem em chat.

## Primeira publicação

Nas duas lojas o **primeiro** envio é manual:

- **Google Play**: a API só publica em app que já tem uma versão enviada pelo
  console. Gere o `.aab` localmente ou peça um run do workflow que falhe no
  upload, baixe o build e suba a primeira versão na faixa interna à mão.
- **App Store Connect**: o app precisa existir (`docs/publicacao-lojas.md`)
  antes de o `altool` conseguir enviar o build.

A partir daí o workflow cuida da faixa interna e do TestFlight.

## Enviar para revisão

1. Confirme que a versão funciona na faixa interna e no TestFlight, em
   aparelho real, nos dois temas.
2. **App Store**: no App Store Connect, escolha o build, preencha _O que há de
   novo_, as declarações de privacidade e a conta de teste para o revisor, e
   envie para revisão.
3. **Google Play**: promova a versão da faixa interna para produção (ou para
   teste fechado, exigido para contas novas), com as notas da versão.
4. Dê ao revisor uma conta de teste com dados fictícios e, se o app exigir
   assinatura, um caminho para testá-la (sandbox).

## Quando a loja reprova

1. Leia a mensagem inteira no App Store Connect (Resolution Center) ou no
   Play Console (_Política e programas_). Ela cita a diretriz violada.
2. Se for questão de metadados (descrição, captura, declaração de dados),
   corrija no console e reenvie: não precisa de build novo.
3. Se exigir mudança no app, abra uma issue com a citação da diretriz,
   corrija pelo fluxo normal, gere **nova tag** e rode o workflow de novo. O
   número do build sempre sobe, então não há conflito.
4. Se discordar da decisão, responda no Resolution Center / recurso do Play
   Console com evidência. Não reenvie o mesmo build sem mudança.
5. Registre o motivo da reprovação e a correção na issue, para a próxima
   revisão não repetir o problema.

Motivos frequentes neste app: compra digital fora do fluxo in-app (issue
#405), declaração de dados diferente do comportamento e ausência de caminho
de exclusão de conta.
