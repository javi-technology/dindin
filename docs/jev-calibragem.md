# Calibragem do Jev na triagem de issues

Registro da medição citada no `AGENTS.md` (issue #491). Permite auditar os
percentuais e repetir a medição.

## O que foi medido

Se o Jev (`jev-latest`, resolvido em `jev-1.13.0`) reproduz o `Priority`, o
`Size` e o `Estimate` que foram definidos à mão no Project, a partir do título,
das labels e do corpo da issue.

## Procedimento

1. Universo: as 139 issues em `Done` que têm `Priority`, `Size` e `Estimate`,
   entre os 157 itens do Project (`gh project item-list 4 --owner
javi-technology --format json`).
2. Amostra de 45 issues: todos os P0 (1), 12 P1, 17 P2 e 15 P3, escolhidos na
   ordem de um embaralhamento com semente 42. **A semente não basta para
   reproduzir a escolha** (o embaralhamento usava `Array.sort` com comparador
   aleatório, cujo resultado depende da versão do Node). A amostra de fato está
   listada abaixo e em `docs/jev-calibragem.json`: use essa lista.
3. Para cada issue, uma chamada com `state = { titulo, labels, corpo }`, onde o
   corpo é cortado em 3500 caracteres, e as três perguntas `choice` de
   `docs/jev-calibragem.json` (campo `perguntas`) juntas.
4. Comparação com o valor do Project no momento da medição (congelado no JSON,
   porque os campos podem mudar depois).

Para repetir: leia as issues da lista, monte o `state` do passo 3 e envie com
`~/.agents/scripts/jev.mjs`.

## Resultado

| Campo      | Acerto exato | Dentro de ±1 nível |
| ---------- | ------------ | ------------------ |
| `Priority` | 23/45 (51%)  | 40/45 (89%)        |
| `Size`     | 17/45 (38%)  | 40/45 (89%)        |
| `Estimate` | 12/45 (27%)  | 32/45 (71%)        |

Por confiança, em `Priority`: ≥ 0,9 acertou 10/15; entre 0,7 e 0,9, 7/11;
abaixo de 0,7, 6/19. Dos 12 P1 da amostra, 5 foram rebaixados para P2.

## Limites

- Os critérios das perguntas foram escritos a partir do `AGENTS.md`, sem ajuste
  posterior. Critérios melhores podem mudar o resultado, e isso não foi medido.
- Uma única rodada, sem repetição para medir a variação entre chamadas.
- A amostra tem 1 P0: nada se conclui sobre P0.
- Mede triagem de issue. **Não mede** a conferência de aderência a regras, que
  tem um único caso testado à mão.

## Amostra e respostas

Cada célula mostra o valor real, o do Jev e, entre parênteses, a confiança do
Jev. Os títulos e as probabilidades completas estão no JSON.

| Issue | Priority real | Priority Jev | Size real | Size Jev  | Estimate real | Estimate Jev |
| ----- | ------------- | ------------ | --------- | --------- | ------------- | ------------ |
| #450  | P0            | P0 (0.75)    | XS        | M (0.35)  | 2             | 2 (0.40)     |
| #365  | P1            | P2 (0.49)    | XS        | XS (0.90) | 1             | 2 (0.48)     |
| #290  | P1            | P1 (0.98)    | M         | M (0.81)  | 3             | 5 (0.31)     |
| #296  | P1            | P1 (1.00)    | XS        | XS (0.58) | 1             | 2 (0.76)     |
| #442  | P1            | P1 (0.99)    | S         | M (0.32)  | 2             | 5 (0.85)     |
| #297  | P1            | P1 (0.98)    | S         | M (0.24)  | 3             | 5 (0.70)     |
| #173  | P1            | P1 (0.99)    | S         | S (0.35)  | 2             | 2 (0.61)     |
| #472  | P1            | P2 (0.69)    | S         | XS (0.26) | 2             | 2 (0.57)     |
| #220  | P1            | P2 (0.73)    | M         | XL (0.92) | 3             | 5 (0.88)     |
| #219  | P1            | P1 (0.94)    | S         | S (0.61)  | 3             | 3 (0.46)     |
| #171  | P1            | P1 (1.00)    | M         | L (0.45)  | 3             | 5 (0.92)     |
| #387  | P1            | P2 (0.47)    | S         | S (0.34)  | 2             | 5 (0.67)     |
| #461  | P1            | P2 (0.34)    | S         | M (0.39)  | 2             | 2 (0.38)     |
| #397  | P2            | P1 (0.95)    | M         | L (0.76)  | 3             | 5 (0.98)     |
| #242  | P2            | P2 (0.72)    | M         | M (0.25)  | 3             | 5 (0.93)     |
| #200  | P2            | P2 (0.58)    | S         | M (0.45)  | 3             | 5 (0.59)     |
| #215  | P2            | P1 (0.51)    | M         | S (0.50)  | 3             | 5 (0.90)     |
| #247  | P2            | P2 (0.84)    | L         | M (0.57)  | 5             | 5 (0.98)     |
| #22   | P2            | P2 (0.47)    | M         | M (0.41)  | 3             | 5 (0.85)     |
| #195  | P2            | P2 (0.91)    | M         | L (0.74)  | 5             | 5 (0.96)     |
| #144  | P2            | P1 (0.63)    | XS        | XS (0.87) | 1             | 3 (0.38)     |
| #300  | P2            | P1 (0.96)    | L         | L (0.63)  | 5             | 5 (0.99)     |
| #258  | P2            | P2 (0.76)    | S         | S (0.39)  | 3             | 5 (0.30)     |
| #314  | P2            | P1 (0.93)    | S         | M (0.52)  | 2             | 5 (0.90)     |
| #313  | P2            | P2 (0.29)    | M         | M (0.59)  | 3             | 5 (0.93)     |
| #262  | P2            | P1 (0.94)    | L         | M (0.63)  | 8             | 5 (0.99)     |
| #483  | P2            | P2 (0.46)    | XS        | M (0.52)  | 1             | 5 (0.24)     |
| #399  | P2            | P2 (0.68)    | L         | XL (0.95) | 5             | 5 (0.90)     |
| #395  | P2            | P1 (0.47)    | L         | L (0.75)  | 5             | 5 (0.65)     |
| #25   | P2            | P2 (0.41)    | S         | M (0.48)  | 2             | 5 (0.52)     |
| #24   | P3            | P1 (0.97)    | XL        | L (0.79)  | 8             | 5 (0.91)     |
| #301  | P3            | P2 (0.71)    | XS        | S (0.70)  | 1             | 3 (0.39)     |
| #372  | P3            | P3 (0.99)    | XS        | S (0.37)  | 1             | 2 (0.44)     |
| #309  | P3            | P3 (0.86)    | M         | S (0.49)  | 5             | 5 (0.61)     |
| #271  | P3            | P3 (0.96)    | XS        | S (0.85)  | 1             | 3 (0.38)     |
| #27   | P3            | P2 (0.57)    | L         | L (0.28)  | 5             | 5 (0.84)     |
| #235  | P3            | P3 (0.85)    | S         | L (0.55)  | 2             | 5 (0.50)     |
| #323  | P3            | P2 (0.67)    | S         | L (0.36)  | 2             | 5 (0.79)     |
| #362  | P3            | P1 (0.60)    | XS        | S (0.47)  | 1             | 5 (0.52)     |
| #317  | P3            | P1 (0.27)    | M         | M (0.63)  | 3             | 5 (0.92)     |
| #311  | P3            | P3 (0.87)    | M         | S (0.43)  | 3             | 5 (0.80)     |
| #325  | P3            | P2 (0.45)    | S         | M (0.66)  | 2             | 5 (0.63)     |
| #319  | P3            | P1 (0.48)    | S         | S (0.47)  | 3             | 5 (0.42)     |
| #326  | P3            | P1 (0.82)    | S         | M (0.24)  | 3             | 5 (0.98)     |
| #244  | P3            | P2 (0.80)    | S         | S (0.58)  | 2             | 5 (0.43)     |
