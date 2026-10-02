# Compatibilidade entre o app instalado e a API

Issue #500. O web atualiza junto com o Hosting. O app **não**: o aparelho
continua rodando a versão instalada depois de cada deploy da API, e uma
correção só chega com uma nova versão publicada nas lojas (dias, no caso da
App Store). Qualquer mudança no contrato precisa considerar quem ainda roda a
versão anterior.

## O que é compatível e o que não é

Do ponto de vista de quem **consome** a API:

| Mudança                                                              | Compatível? |
| -------------------------------------------------------------------- | ----------- |
| Rota nova                                                            | sim         |
| Campo opcional novo na resposta                                      | sim         |
| Campo opcional novo na requisição                                    | sim         |
| Rota, método ou status 2xx removido                                  | **não**     |
| Campo removido ou renomeado na resposta                              | **não**     |
| Campo da resposta com outro tipo                                     | **não**     |
| Campo da resposta que deixou de ser obrigatório                      | **não**     |
| Valor novo em enum de resposta (o Dart gerado recusa o desconhecido) | **não**     |
| Campo obrigatório novo na requisição                                 | **não**     |
| Campo da requisição que passou a ser obrigatório                     | **não**     |
| Valor removido de enum da requisição                                 | **não**     |

Para renomear, entregue o campo novo **ao lado** do antigo, mantenha os dois
até a versão mínima do app dispensar o antigo e só então o remova.

## Como o CI protege isso

`scripts/openapi-breaking.mjs` compara o `openapi/dindin.yaml` do PR com o da
branch-base (job `lint`, só em pull request) e reprova a mudança incompatível.

Para fazê-la de propósito, acrescente uma linha em `x-incompatible-changes`, na
raiz do YAML: a issue, o que mudou e a versão mínima do app que passa a ser
exigida. Só vale a entrada **nova** em relação à base; a lista é histórico e
não libera mudanças futuras.

```bash
git show origin/develop:openapi/dindin.yaml > /tmp/base.yaml
node scripts/openapi-breaking.mjs /tmp/base.yaml openapi/dindin.yaml
```

## Versão mínima do app

- O app lê a própria versão (`package_info_plus`) e a manda em **toda**
  requisição no cabeçalho `X-App-Version` (`X.Y.Z`; build e pré-release são
  ignorados).
- Antes da autenticação, em `/api/*`, a API compara com a mínima em vigor. Abaixo
  dela, responde **426** com `{ error, code: "APP_UPDATE_REQUIRED" }`.
  `/api/health` e os webhooks ficam fora.
- A mínima vem de `APP_MIN_VERSION` (variável do GitHub Actions
  `APP_MIN_VERSION`, escrita no `.env` das Functions no deploy). Vazia, inválida
  ou ausente: `1.0.0`, ou seja, todo app publicado.
- **Quem não manda o cabeçalho passa**: o web, e os apps publicados antes desta
  política, que não podem ser bloqueados (não sabem exibir a tela). Versão
  ilegível também passa, para não bloquear usuário legítimo por engano.

### No app

`ApiClient` aciona `AtualizacaoObrigatoria` ao receber 426 com
`APP_UPDATE_REQUIRED`; o `AtualizacaoGate`, acima do `Navigator`, troca o app
inteiro pela tela "Atualize o DinDin". Os demais 426 são erros comuns. A
recusa pode vir de qualquer requisição, por isso o tratamento é global e não
por tela.

O app **ignora campo desconhecido** na resposta: o modelo gerado lê só os
campos que conhece, e é isso que torna "campo opcional novo" compatível.

## Como subir a versão mínima

1. Publique a versão corrigida nas **duas** lojas e espere a aprovação.
2. Declare a mudança em `x-incompatible-changes` (se houve mudança de contrato).
3. Defina `APP_MIN_VERSION` no GitHub (Settings → Environments → production →
   Variables) com a versão publicada e faça o deploy.

Subir a mínima antes da versão estar disponível deixa o usuário preso na tela
de atualização, sem versão para instalar.
