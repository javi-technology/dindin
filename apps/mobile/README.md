# DinDin Mobile

App do DinDin para iOS e Android, em Flutter (issue #398).

Esta pasta é um projeto Dart e **não** é um workspace npm: os workspaces da
raiz listam `apps/api` e `apps/web` um a um justamente para que o `npm ci` não
tropece numa pasta sem `package.json`.

## Requisitos

O SDK está fixado em [`.flutter-version`](.flutter-version), e o job
`build-and-test-mobile` do CI instala exatamente essa versão — o job reprova
quando o número do workflow e o do arquivo divergem.

```bash
flutter --version   # precisa bater com .flutter-version
flutter pub get
```

## Comandos

Rode-os pela raiz do monorepo, para não depender do diretório atual:

```bash
npm run mobile:test           # suíte (flutter test)
npm run mobile:lint           # análise estática (flutter analyze --fatal-infos)
npm run mobile:format         # formatar (dart format)
npm run mobile:format:check   # verificar a formatação, como o CI faz
```

Prettier e ESLint não alcançam `.dart`: o app é formatado e analisado só por
estes comandos, e o `.prettierignore` exclui esta pasta para que as duas
ferramentas não briguem pelos mesmos arquivos.

## Estrutura

```
lib/
  main.dart   # ponto de entrada
  app.dart    # raiz do app: nome, locale pt-BR
test/
  app_test.dart
```

O app hoje é o esqueleto: autenticação (#400), tema e componentes comuns
(#401) e as telas de dados (#402) chegam nas issues seguintes.

## Credenciais

`google-services.json`, `GoogleService-Info.plist` e `firebase_options.dart`
ficam fora do versionamento, como qualquer credencial do projeto. A issue #400
documenta como obtê-los.
