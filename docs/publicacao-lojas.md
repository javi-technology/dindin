# Publicação nas lojas: contas e material

Passo a passo do que precisa existir na App Store e no Google Play antes de o
DinDin ser publicado (issue #406). São etapas administrativas: nada aqui se
resolve com código, e as duas contas têm prazo de aprovação que não depende do
time — comece por elas.

Registre neste arquivo, na coluna _Feito_, cada item concluído, com data e
responsável. A renovação anual e a troca de responsável não podem depender de
memória.

## Contas

| Loja                    | Custo      | Prazo típico                        | Quem cria                      |
| ----------------------- | ---------- | ----------------------------------- | ------------------------------ |
| Apple Developer Program | anual      | dias (conta de organização: mais)   | responsável legal da Javi Tech |
| Google Play Console     | taxa única | dias, com verificação de identidade | responsável legal da Javi Tech |

- Crie as contas como **organização**, não como pessoa física: o nome que
  aparece na loja é o da conta, e trocar depois exige um processo próprio.
- Ative **venda de assinatura** nas duas: são necessários os contratos de apps
  pagos, dados bancários e dados fiscais. Esse costuma ser o passo mais lento.
- Use um e-mail de grupo como titular, e não o de uma pessoa. Quando ela sair
  da empresa, a conta continua acessível.

## Registro do aplicativo

O identificador é **`tech.javi.dindin`** nas duas lojas e no Firebase
(`docs/mobile-firebase.md`). Não é possível trocá-lo depois de publicado.

| Loja        | Onde cadastrar                                         |
| ----------- | ------------------------------------------------------ |
| App Store   | App Store Connect → Apps → novo app, _Bundle ID_ igual |
| Google Play | Play Console → Criar app; o _package name_ é o mesmo   |

## Produtos de assinatura

Cadastre nas duas lojas **o mesmo plano que a web vende** (mensal e anual, com
os mesmos valores dos Prices da Stripe: `STRIPE_PRICE_BASIC_MONTHLY` e
`STRIPE_PRICE_BASIC_YEARLY`). Use ids idênticos nas duas lojas, para o backend
mapear o produto ao entitlement sem tabela por plataforma. Sugestão:

| Plano  | Id do produto          |
| ------ | ---------------------- |
| Mensal | `dindin_basic_monthly` |
| Anual  | `dindin_basic_yearly`  |

Esses ids alimentam a issue #405 (compra in-app).

## Material de publicação

| Item                     | Requisito                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| Ícone                    | 1024×1024 px, sem transparência, sem cantos arredondados (a loja aplica)  |
| Tela de abertura         | fundo e marca na paleta de `docs/paleta.md`, com contraste nos dois temas |
| Capturas de tela         | ao menos iPhone 6,9" e 6,5"; celular Android; em pt-BR, com dado fictício |
| Descrição                | em português; curta (80 caracteres no Google Play) e longa                |
| Classificação indicativa | questionário de cada loja                                                 |
| Política de privacidade  | `https://<domínio do Hosting>/privacidade` (rota pública do web)          |

- As capturas **não podem mostrar dado real** de nenhum usuário.
- O ícone e a tela de abertura precisam ser gerados a partir da paleta e da
  identidade do produto; o app ainda usa os padrões do Flutter.

## Política de privacidade

O texto está em `apps/web/src/app/features/privacy/` e é publicado pelo mesmo
deploy do web, em `/privacidade`. Revise o texto e o **e-mail de contato**
antes de informar a URL às lojas. Quando o app passar a coletar algo novo, o
texto e as declarações abaixo mudam juntos.

## Declarações de coleta e uso de dados

Preencha conforme o que o app **de fato faz**; declaração diferente do
comportamento é motivo de reprovação e de remoção.

| Dado                                             | Coletado | Finalidade                       | Vinculado ao usuário |
| ------------------------------------------------ | -------- | -------------------------------- | -------------------- |
| Nome, e-mail e foto                              | sim      | conta e login                    | sim                  |
| Informações financeiras                          | sim      | carteira, projeções e simulações | sim                  |
| Identificador do aparelho (token de notificação) | sim      | avisos de preço-alvo             | sim                  |
| Histórico de compras (assinatura)                | sim      | liberar recursos pagos           | sim                  |
| Localização, contatos, fotos                     | não      | –                                | ,                    |
| Rastreamento entre apps                          | não      | –                                | ,                    |

- App Store: _App Privacy_ no App Store Connect. Não há rastreamento.
- Google Play: _Segurança dos dados_. Os dados são criptografados em trânsito
  (HTTPS) e o usuário pode pedir a exclusão pelo e-mail de contato.
- **Exclusão de conta:** as duas lojas exigem caminho de exclusão dentro do app
  ou por URL. Isso ainda não existe e deve virar issue própria antes da
  publicação pública.

## Responsáveis e renovação

| O quê                             | Responsável | Renovação / prazo                            |
| --------------------------------- | ----------- | -------------------------------------------- |
| Apple Developer Program           | a definir   | anual (data da inscrição)                    |
| Google Play Console               | a definir   | sem renovação; manter o perfil de pagamentos |
| Contratos de apps pagos (as duas) | a definir   | aceitar as atualizações que a loja pedir     |

## Checklist

| Item                                                      | Feito |
| --------------------------------------------------------- | ----- |
| Conta Apple Developer criada e habilitada para assinatura |       |
| Conta Google Play Console criada e habilitada             |       |
| App registrado nas duas lojas com `tech.javi.dindin`      |       |
| Produtos de assinatura cadastrados nas duas lojas         |       |
| Ícone, tela de abertura e capturas produzidos             |       |
| Política de privacidade publicada em URL pública          |       |
| Declarações de dados preenchidas nas duas lojas           |       |
| Classificação indicativa e descrição definidas            |       |
