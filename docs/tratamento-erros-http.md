# Tratamento de erros HTTP no web e no app

Issue #505. O web (Angular) e o app (Flutter) falam com a mesma API, então o
mesmo erro precisa ter o mesmo efeito e o mesmo texto nas duas plataformas.
Antes cada cliente tratava à sua maneira: o 429 só tinha tratamento numa tela
do web, e o app repassava a mensagem da API sem distinguir status nem código.

## Matriz

| Status / código                       | Web                                                                         | App                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| sem resposta (rede)                   | `httpErrorInterceptor`: "Sem conexão com o servidor. Tente de novo."        | `NetworkException`: mesmo texto                                           |
| 401                                   | `unauthorizedInterceptor`: sai da sessão e vai para `/login`                | renova o token e repete **uma vez**; persistindo, `UnauthorizedException` |
| 403 `SUBSCRIPTION_REQUIRED`           | `unauthorizedInterceptor` marca `subscriptionRequired` (oferece assinatura) | `ApiException.code`: a tela oferece a assinatura                          |
| 403 outro                             | mensagem da API, na tela                                                    | mensagem da API, na tela                                                  |
| 400, 404, 409                         | mensagem da API (pt-BR), na tela                                            | mensagem e `code` da API, na tela                                         |
| 426 `APP_UPDATE_REQUIRED`             | não se aplica: o web atualiza junto com o Hosting                           | tela "Atualize o DinDin" (#500)                                           |
| **429 `RATE_LIMITED`**                | aviso global com a espera + mensagem com a espera                           | aviso global com a espera + mensagem com a espera                         |
| 429 sem `RATE_LIMITED` (limite da IA) | mensagem da API, na tela                                                    | mensagem da API, na tela                                                  |
| 500                                   | "Erro interno do servidor" (texto da API)                                   | "Erro interno do servidor" (texto da API)                                 |
| 502, 503, 504                         | texto da API quando há; senão "O serviço está indisponível no momento…"     | idem                                                                      |

Textos fixos (iguais nas duas plataformas):

- Rede: `Sem conexão com o servidor. Tente de novo.`
- Indisponível: `O serviço está indisponível no momento. Tente de novo em instantes.`
- Rate limit: `Muitas requisições. Aguarde N segundos e tente de novo.` (singular
  em 1 segundo)

## Rate limit

- A API limita `/api/*` por IP e responde 429 com
  `{ error: "Muitas requisições", code: "RATE_LIMITED" }` e `Retry-After` em
  segundos (o portal da Stripe usa o mesmo contrato). O código existe porque a
  IA também responde 429, com mensagem de negócio, e esse caso não deve abrir o
  aviso de espera.
- O limite vale para qualquer rota, então o aviso é **global**: no web, a faixa
  `app-rate-limit-notice` no topo do shell; no app, o `AvisoDeLimiteGate` acima
  do `Navigator`. Nos dois a tela continua visível e o aviso some sozinho
  quando a espera acaba, ou ao ser fechado.
- Sem `Retry-After` válido, assume-se 60 segundos, a janela do limite.

## Onde vive cada coisa

|                     | Web                                                   | App                                                               |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Normalização        | `core/interceptors/http-error.interceptor.ts`         | `ApiClient._interpretar` (`core/api/api_client.dart`)             |
| Textos e constantes | `core/http/http-errors.ts`                            | `core/api/aviso_de_limite.dart`, `api_exception.dart`             |
| Aviso global        | `RateLimitNoticeService` + `RateLimitNoticeComponent` | `AvisoDeLimite` + `AvisoDeLimiteGate`                             |
| Testes              | `http-error.interceptor.spec.ts`                      | `test/core/api/erros_http_test.dart`, `aviso_de_limite_gate_test` |

Ao mudar uma linha da matriz, mude as duas plataformas e os dois testes.
