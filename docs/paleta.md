# Paleta Verde-Jade e Creme

Fonte única das cores do app: `apps/web/src/styles.css`. As telas consomem os
**tokens semânticos por papel** (`bg-surface`, `text-text-primary`,
`bg-action`…), nunca o passo da escala (`bg-jade-700`). Usar o passo direto
fixa o tema claro na marcação e obriga a revisitar o arquivo quando o modo
escuro entrar.

A identidade é **#00BB77 (Verde-Jade)** como primária e **#FDFBD4 (Creme)**
como secundária. Duas medições condicionam todo o resto:

- #00BB77 sobre branco dá **2,51:1** — reprova AA para texto (4,5:1) e para
  elemento gráfico (3:1). Por isso a ação primária no claro usa o jade
  escurecido, não o puro.
- #FDFBD4 sobre branco dá **1,05:1** — o creme é cor de superfície e de acento,
  nunca de ação.

## Escalas

As escalas não mudam de valor entre os temas. O que muda é o passo para onde
cada papel aponta.

### `jade` — matiz 158,6°, ancorada em #00BB77 no passo 500

| Passo | Valor     |
| ----- | --------- |
| 50    | `#E4FFEE` |
| 100   | `#CFF9DF` |
| 300   | `#7DDFAA` |
| 400   | `#4ACF8F` |
| 500   | `#00BB77` |
| 600   | `#009F65` |
| 700   | `#008654` |
| 900   | `#005634` |

`jade-ink` (`#0B2E22`) fica fora da escala de propósito: é o texto sobre a ação
primária no escuro, um par de contraste e não um passo de luminosidade.

### `creme` — matiz 104,9°, ancorada em #FDFBD4 no passo 50

| Passo | Valor     |
| ----- | --------- |
| 50    | `#FDFBD4` |
| 300   | `#E2DC8E` |
| 600   | `#948B05` |
| 700   | `#7B7301` |
| 900   | `#4F4A00` |

### `neutral` — derivada do creme, matiz 104,9° com croma quase nulo

Substitui o `neutral` padrão do Tailwind, para o cinza do app não brigar com a
marca. Os passos 800 a 975 são as superfícies do tema escuro.

| Passo | Valor     | Uso previsto                             |
| ----- | --------- | ---------------------------------------- |
| 50    | `#FBFAF4` | superfície do tema claro                 |
| 100   | `#F4F3EB` | superfície sutil, faixa de tabela        |
| 200   | `#E7E7E1` | borda decorativa (claro), texto (escuro) |
| 300   | `#D2D2CC` | borda decorativa mais marcada            |
| 400   | `#ABABA5` | texto secundário do tema escuro          |
| 500   | `#888883` | borda informativa do tema claro          |
| 600   | `#696964` | borda informativa do tema escuro         |
| 700   | `#52524D` | texto secundário do tema claro           |
| 800   | `#3A3935` | borda decorativa do tema escuro          |
| 850   | `#2C2C27` | superfície escura de terceiro nível      |
| 900   | `#1F1E1A` | superfície elevada do tema escuro        |
| 950   | `#141410` | texto primário do tema claro             |
| 975   | `#12120E` | superfície base do tema escuro           |

### Semânticas

| Escala     | Passo do claro | Passo do escuro |
| ---------- | -------------- | --------------- |
| `info`     | 600 `#0388A4`  | 400 `#28BDE0`   |
| `warning`  | 600 `#9F7100`  | 400 `#D7A035`   |
| `danger`   | 600 `#C04442`  | 400 `#F8837C`   |
| `positive` | 700 `#167425`  | 400 `#70C174`   |

Cada semântica tem ainda um tom de fundo e um de texto, para badge, faixa de
aviso e mensagem de erro:

| Escala     | Fundo claro  | Texto claro   | Fundo escuro  | Texto escuro |
| ---------- | ------------ | ------------- | ------------- | ------------ |
| `info`     | 50 `#E3F5FA` | 800 `#045A6D` | 950 `#0D2A31` | 400          |
| `warning`  | 50 `#F9EFD8` | 800 `#6E4E00` | 950 `#2E2410` | 400          |
| `danger`   | 50 `#FDECEC` | 800 `#8E2E2C` | 950 `#331A19` | 400          |
| `positive` | 50 `#E6F4E8` | 900 `#10561C` | 950 `#16261A` | 400          |
| `jade`     | 50 `#E4FFEE` | 900 `#005634` | 950 `#0A2A1F` | 300          |

`danger` tem ainda o passo 300 `#FBB0AB`, o hover do botão destrutivo no tema
escuro — onde o hover precisa clarear, não escurecer.

Os passos 600/700 das semânticas ficam entre 4,0:1 e 5,6:1 sobre a superfície
clara: servem a ícone, borda e realce (limite de 3:1), não a texto corrido. O
texto usa o par `-ink`, que passa dos 4,5:1 tanto sobre o tom suave quanto
sobre a superfície comum.

`positive` é um verde distinto do jade de propósito: um botão primário e um
número em alta não podem disputar a mesma cor na tela.

## Tokens semânticos por papel

O que as telas usam. Cada um aponta para um passo no claro e para outro no
escuro, redefinido sob `prefers-color-scheme: dark`.

| Papel              | Claro          | Escuro         | Uso e contraste                     |
| ------------------ | -------------- | -------------- | ----------------------------------- |
| `surface`          | `neutral-50`   | `neutral-975`  | fundo da página                     |
| `surface-elevated` | `#FFFFFF`      | `neutral-900`  | cartão, modal, cabeçalho fixo       |
| `surface-sunken`   | `neutral-100`  | `neutral-850`  | cabeçalho de tabela, área rebaixada |
| `text-primary`     | `neutral-950`  | `neutral-200`  | 17,6:1 no claro / 14,0:1 no escuro  |
| `text-secondary`   | `neutral-700`  | `neutral-400`  | 7,6:1 no claro / 8,1:1 no escuro    |
| `text-muted`       | `neutral-600`  | `neutral-450`  | 5,3:1 no claro / 6,7:1 no escuro    |
| `action`           | `jade-700`     | `jade-500`     | ver abaixo                          |
| `action-hover`     | `jade-900`     | `jade-400`     | hover e active da ação primária     |
| `on-action`        | `#FFFFFF`      | `jade-ink`     | 4,63:1 no claro / 5,86:1 no escuro  |
| `accent`           | `creme-700`    | `creme-50`     | acento de marca, não corpo de texto |
| `border`           | `neutral-200`  | `neutral-800`  | borda decorativa                    |
| `border-strong`    | `neutral-500`  | `neutral-600`  | 3,4:1 no claro / 3,5:1 no escuro    |
| `focus`            | `jade-700`     | `jade-400`     | 4,46:1 no claro / 9,57:1 no escuro  |
| `info`             | `info-600`     | `info-400`     | ícone e borda, ao menos 3:1         |
| `warning`          | `warning-600`  | `warning-400`  | ícone e borda, ao menos 3:1         |
| `danger`           | `danger-600`   | `danger-400`   | ícone, borda e valor em baixa       |
| `danger-hover`     | `danger-800`   | `danger-300`   | hover do botão destrutivo           |
| `on-danger`        | `#FFFFFF`      | `neutral-950`  | 5,1:1 no claro / 7,5:1 no escuro    |
| `overlay`          | `#141410` 50%  | `#050503` 70%  | véu do modal                        |
| `positive`         | `positive-700` | `positive-400` | ícone, borda e valor em alta        |
| `brand-soft`       | `jade-50`      | `jade-950`     | fundo de badge da marca             |
| `brand-ink`        | `jade-900`     | `jade-300`     | texto sobre `brand-soft`            |
| `info-soft`        | `info-50`      | `info-950`     | fundo de faixa informativa          |
| `info-ink`         | `info-800`     | `info-400`     | texto sobre `info-soft`             |
| `warning-soft`     | `warning-50`   | `warning-950`  | fundo de faixa de aviso             |
| `warning-ink`      | `warning-800`  | `warning-400`  | texto sobre `warning-soft`          |
| `danger-soft`      | `danger-50`    | `danger-950`   | fundo de mensagem de erro           |
| `danger-ink`       | `danger-800`   | `danger-400`   | texto sobre `danger-soft`           |
| `positive-soft`    | `positive-50`  | `positive-950` | fundo de badge de valorização       |
| `positive-ink`     | `positive-900` | `positive-400` | texto sobre `positive-soft`         |

### Por que a ação inverte entre os temas

No claro, `jade-700` #008654 com texto branco dá **4,63:1**. No escuro,
`jade-700` contra a superfície #12120E cai para **3,60:1** e o botão some — por
isso o escuro usa `jade-500` #00BB77 com texto `jade-ink` #0B2E22, que dá
**5,86:1**.

O creme faz o caminho inverso: fundo no claro, acento no escuro. Como corpo de
texto no escuro ele chega a 17,8:1, e esse excesso de contraste cansa a leitura.

### Armadilha das bordas no escuro

Uma borda que carrega informação só atinge 3:1 contra a superfície escura a
partir de `#696964` — bem mais claro do que a intuição sugere. Borda apenas
decorativa pode usar `neutral-800` `#3A3935`.

## Como escolher o token

| O elemento é…                          | Token                           |
| -------------------------------------- | ------------------------------- |
| fundo da página                        | `bg-surface`                    |
| cartão, modal, linha de tabela         | `bg-surface-elevated`           |
| cabeçalho de tabela, área rebaixada    | `bg-surface-sunken`             |
| título, valor em destaque              | `text-text-primary`             |
| texto corrido, rótulo                  | `text-text-secondary`           |
| legenda, texto de apoio, ícone neutro  | `text-text-muted`               |
| botão primário                         | `bg-action text-on-action`      |
| borda de campo, divisor com informação | `border-border-strong`          |
| divisor apenas decorativo              | `border-border`                 |
| anel de foco                           | `ring-focus`                    |
| número em alta / em baixa              | `text-positive` / `text-danger` |
| badge, faixa de aviso, erro            | `bg-<x>-soft text-<x>-ink`      |

## Gráficos

A série categórica dos gráficos fica em
`apps/web/src/app/shared/components/charts/chart-palette.ts`, e aponta para os
tokens `chart-1` a `chart-8`, mais `chart-other` para a fatia "Outros". Um
gráfico novo pega a cor de lá; não inventa a própria.

| Token         | Claro          | Escuro         |
| ------------- | -------------- | -------------- |
| `chart-1`     | `jade-700`     | `jade-500`     |
| `chart-2`     | `jade-300`     | `jade-100`     |
| `chart-3`     | `danger-800`   | `danger-600`   |
| `chart-4`     | `info-400`     | `info-400`     |
| `chart-5`     | `creme-700`    | `warning-600`  |
| `chart-6`     | `positive-400` | `positive-400` |
| `chart-7`     | `info-600`     | `info-600`     |
| `chart-8`     | `warning-400`  | `creme-300`    |
| `chart-other` | `neutral-500`  | `neutral-500`  |

A ordem é o que importa: séries vizinhas se distinguem por **luminosidade**, e
não por matiz, para continuarem legíveis em impressão em tons de cinza e para
quem tem baixa visão de cor. A suíte exige ao menos 1,5:1 entre séries vizinhas
e entre cada série e a superfície, nos dois temas.

Alta e baixa em gráfico usam `positive` e `danger`, os mesmos tokens das
tabelas. Grade, eixo, linha e área usam os tokens de papel (`stroke-border`,
`stroke-action`, `fill-brand-soft`).

## E-mail

Cliente de e-mail não lê o CSS do app, então lá a cor vai em hexadecimal
literal, em `apps/api/src/alerts/alert-mail.service.ts`. São os valores do tema
claro, porque o fundo da mensagem é o branco do cliente: texto `#141410`
(18,9:1), texto de apoio `#52524D` (7,7:1) e link `#008654` (4,63:1).

## Limites a respeitar

- Texto sobre fundo: **4,5:1** nos dois temas.
- Borda e ícone informativos: **3:1** nos dois temas.
- Valorização e desvalorização usam `positive` e `danger`, nunca o token da
  marca.
