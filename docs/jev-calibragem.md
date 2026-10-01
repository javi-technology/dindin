# Calibragem do Jev na triagem de issues

Registro da medição citada no `AGENTS.md` (issue #491). Permite auditar os
percentuais e repetir a medição.

## O que foi medido

Se o Jev (`jev-latest`, resolvido em `jev-1.13.0`) reproduz o `Priority`, o
`Size` e o `Estimate` que estão no Project, a partir do título, das labels e
do corpo da issue.

## Procedimento

1. Amostra: as **50 issues fechadas (concluídas) mais recentes** que têm os três
   campos preenchidos, fechadas entre 2026-09-23 e 2026-09-30. Nenhuma
   issue do período ficou de fora por falta de campo. Sem sorteio: o critério é
   a data de fechamento, o que evita escolher casos favoráveis.
2. Para cada issue, uma chamada com `state = { titulo, labels, corpo }` (corpo
   cortado em 3500 caracteres) e as três perguntas `choice` do campo
   `perguntas` de `docs/jev-calibragem.json`, juntas. Os critérios das
   perguntas foram escritos a partir do `AGENTS.md` e **não foram ajustados
   depois de ver o resultado**.
3. Comparação com o valor do Project no momento da medição, congelado no JSON.

Para repetir sobre a mesma amostra, use as issues listadas abaixo. Para medir de
novo com as 50 mais recentes do momento, na raiz do repositório e com
`TYPESAFE_API_KEY` definida: `node ~/.agents/scripts/jev-calibragem.mjs 50 saida.json`.

## Resultado

| Campo      | Acerto exato | Dentro de ±1 nível |
| ---------- | ------------ | ------------------ |
| `Priority` | 24/50 (48%)  | 42/50 (84%)        |
| `Size`     | 24/50 (48%)  | 45/50 (90%)        |
| `Estimate` | 18/50 (36%)  | 39/50 (78%)        |

Acertos por faixa de confiança (acertos/total):

- `Priority`: >=0.9: 3/10; <0.7: 7/26; 0.7-0.9: 14/14
- `Size`: >=0.9: 0/1; <0.7: 22/45; 0.7-0.9: 2/4
- `Estimate`: >=0.9: 9/20; <0.7: 7/20; 0.7-0.9: 2/10

Em `Priority`, dos 9 P1 da amostra, 2 foram rebaixados para P2 (#472, #387) e 3 foram
elevados a P0. 14 issues que não eram P1 foram elevadas a P0 ou P1.
`Estimate` converge para 5: das 36 respostas `5`, só 12 coincidem com o real.

## Medição anterior

Uma primeira rodada, com 45 issues sorteadas (13 delas também estão nesta
amostra), deu 51% exato em `Priority`, 38% em `Size` e 27% em `Estimate`; 5
de 12 P1 rebaixados. A faixa de confiança ≥ 0,9 acertou 10/15 em `Priority` ali
e 3/10 aqui, e a faixa 0,7–0,9 acertou 7/11 ali e 14/14 aqui: **a confiança não
se comportou de forma consistente entre as duas amostras**. Os dados daquela
rodada foram substituídos por esta.

## Limites

- Os valores do Project foram tomados como verdade. Não foi verificado se cada
  um foi definido à mão ou por um agente em sessão anterior.
- Os critérios das perguntas são os do primeiro rascunho, sem ajuste. Critérios
  melhores podem mudar o resultado, e isso não foi medido.
- Uma rodada por amostra, sem repetição para medir a variação entre chamadas.
- A amostra tem 1 P0 e 9 P1: pouco para concluir sobre os casos graves.
- Mede triagem de issue. **Não mede** a conferência de aderência a regras, que
  tem um único caso testado à mão.

## Amostra e respostas

Cada campo mostra o valor real, o do Jev e, entre parênteses, a confiança do
Jev. Os títulos e as probabilidades completas estão no JSON.

| Issue | Fechada em | Priority real | Priority Jev | Size real | Size Jev  | Estimate real | Estimate Jev |
| ----- | ---------- | ------------- | ------------ | --------- | --------- | ------------- | ------------ |
| #485  | 2026-09-30 | P2            | P2 (0.80)    | XS        | XS (0.39) | 1             | 2 (0.83)     |
| #487  | 2026-09-30 | P1            | P0 (0.42)    | XS        | XS (0.32) | 2             | 2 (0.83)     |
| #483  | 2026-09-30 | P2            | P2 (0.41)    | XS        | M (0.54)  | 1             | 3 (0.30)     |
| #475  | 2026-09-30 | P2            | P2 (0.62)    | M         | XS (0.22) | 3             | 2 (0.50)     |
| #474  | 2026-09-30 | P2            | P2 (0.74)    | M         | M (0.19)  | 3             | 2 (0.52)     |
| #473  | 2026-09-30 | P2            | P2 (0.70)    | S         | XS (0.22) | 1             | 2 (0.60)     |
| #472  | 2026-09-30 | P1            | P2 (0.65)    | S         | XS (0.28) | 2             | 2 (0.64)     |
| #471  | 2026-09-30 | P2            | P2 (0.60)    | S         | S (0.20)  | 1             | 2 (0.60)     |
| #469  | 2026-09-30 | P3            | P3 (0.96)    | S         | M (0.41)  | 2             | 5 (0.81)     |
| #407  | 2026-09-30 | P3            | P2 (0.62)    | L         | L (0.37)  | 5             | 5 (0.96)     |
| #406  | 2026-09-30 | P3            | P1 (0.43)    | M         | M (0.20)  | 3             | 5 (0.88)     |
| #405  | 2026-09-30 | P3            | P1 (0.99)    | XL        | XL (0.47) | 8             | 5 (0.83)     |
| #467  | 2026-09-30 | P2            | P1 (0.67)    | S         | M (0.33)  | 2             | 5 (0.93)     |
| #450  | 2026-09-29 | P0            | P0 (0.84)    | XS        | M (0.31)  | 2             | 2 (0.43)     |
| #461  | 2026-09-29 | P1            | P0 (0.35)    | S         | M (0.42)  | 2             | 2 (0.41)     |
| #458  | 2026-09-29 | P3            | P2 (0.49)    | XS        | XS (0.75) | 1             | 2 (0.61)     |
| #453  | 2026-09-29 | P1            | P1 (0.83)    | XS        | XS (0.44) | 2             | 3 (0.50)     |
| #446  | 2026-09-29 | P3            | P1 (0.69)    | L         | L (0.41)  | 5             | 5 (0.96)     |
| #445  | 2026-09-29 | P3            | P2 (0.93)    | L         | L (0.42)  | 5             | 5 (0.97)     |
| #444  | 2026-09-29 | P2            | P2 (0.63)    | M         | M (0.50)  | 3             | 5 (0.98)     |
| #443  | 2026-09-29 | P2            | P2 (0.75)    | M         | M (0.32)  | 3             | 5 (0.86)     |
| #442  | 2026-09-29 | P1            | P1 (0.98)    | S         | M (0.42)  | 2             | 5 (0.84)     |
| #440  | 2026-09-29 | P1            | P0 (0.13)    | S         | M (0.41)  | 2             | 5 (0.49)     |
| #408  | 2026-09-29 | P3            | P1 (0.63)    | L         | L (0.57)  | 5             | 5 (0.94)     |
| #404  | 2026-09-29 | P3            | P1 (0.40)    | L         | L (0.45)  | 5             | 5 (0.97)     |
| #403  | 2026-09-29 | P3            | P1 (1.00)    | XL        | L (0.52)  | 8             | 5 (0.95)     |
| #402  | 2026-09-29 | P2            | P2 (0.43)    | XL        | L (0.37)  | 8             | 5 (0.97)     |
| #401  | 2026-09-29 | P2            | P2 (0.84)    | L         | L (0.36)  | 5             | 5 (0.96)     |
| #400  | 2026-09-29 | P2            | P1 (0.95)    | L         | L (0.66)  | 5             | 5 (0.95)     |
| #399  | 2026-09-29 | P2            | P2 (0.65)    | L         | XL (0.97) | 5             | 5 (0.89)     |
| #398  | 2026-09-29 | P2            | P2 (0.86)    | M         | L (0.44)  | 3             | 5 (0.98)     |
| #397  | 2026-09-28 | P2            | P1 (0.94)    | M         | L (0.75)  | 3             | 5 (0.99)     |
| #396  | 2026-09-28 | P2            | P1 (0.62)    | L         | L (0.83)  | 5             | 5 (0.99)     |
| #395  | 2026-09-28 | P2            | P1 (0.48)    | L         | L (0.65)  | 5             | 5 (0.67)     |
| #394  | 2026-09-24 | P2            | P2 (0.75)    | L         | L (0.33)  | 8             | 5 (0.95)     |
| #393  | 2026-09-24 | P2            | P2 (0.82)    | S         | M (0.38)  | 3             | 5 (0.97)     |
| #392  | 2026-09-24 | P2            | P2 (0.75)    | XL        | M (0.71)  | 8             | 5 (0.90)     |
| #391  | 2026-09-24 | P2            | P2 (0.58)    | M         | M (0.53)  | 5             | 5 (0.62)     |
| #389  | 2026-09-24 | P1            | P1 (0.70)    | M         | L (0.48)  | 5             | 5 (0.96)     |
| #390  | 2026-09-24 | P2            | P2 (0.77)    | M         | L (0.49)  | 3             | 5 (0.94)     |
| #388  | 2026-09-24 | P1            | P1 (0.90)    | XS        | XS (0.27) | 2             | 5 (0.28)     |
| #387  | 2026-09-24 | P1            | P2 (0.36)    | S         | S (0.39)  | 2             | 5 (0.69)     |
| #208  | 2026-09-23 | P3            | P2 (0.49)    | XS        | S (0.53)  | 2             | 2 (0.28)     |
| #258  | 2026-09-23 | P2            | P2 (0.77)    | S         | S (0.37)  | 3             | 3 (0.26)     |
| #325  | 2026-09-23 | P3            | P2 (0.46)    | S         | M (0.62)  | 2             | 5 (0.55)     |
| #362  | 2026-09-23 | P3            | P1 (0.60)    | XS        | S (0.48)  | 1             | 5 (0.53)     |
| #322  | 2026-09-23 | P3            | P1 (0.99)    | S         | M (0.60)  | 3             | 5 (0.96)     |
| #321  | 2026-09-23 | P2            | P1 (0.98)    | S         | M (0.66)  | 3             | 5 (0.74)     |
| #323  | 2026-09-23 | P3            | P2 (0.69)    | S         | L (0.37)  | 2             | 5 (0.77)     |
| #320  | 2026-09-23 | P3            | P2 (0.60)    | S         | M (0.64)  | 2             | 5 (0.22)     |
