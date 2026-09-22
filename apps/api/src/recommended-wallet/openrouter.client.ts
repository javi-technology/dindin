import { HttpError } from '../shared/http-error';
import { logError } from '../shared/logger';

/**
 * Cliente HTTP da OpenRouter (issue #306).
 *
 * Isola a chamada de rede — chave, timeout e tratamento de erro — do resto
 * da sugestão, que passa a lidar só com dados já em memória.
 */

export const OPENROUTER_TIMEOUT_MS = 120_000;

export async function callOpenRouter(
  system: string,
  user: string,
): Promise<{ content: string; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw HttpError.internal('OPENROUTER_API_KEY não configurada');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  const requestBody = {
    model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-5.6-luna',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const request = (body: object) =>
    fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  const logResponseError = async (response: Response): Promise<void> => {
    const body =
      typeof response.text === 'function' ? await response.text() : '';
    const safeBody = body.split(apiKey).join('[redacted]').slice(0, 500);
    // `responseBody`, e não `body`: o logger descarta a chave `body` para não
    // deixar corpo de requisição vazar no log (issue #324), e aqui o conteúdo
    // é a resposta do provedor — o dado mais útil para diagnosticar.
    logError('callOpenRouter.badResponse', {
      status: response.status,
      responseBody: safeBody,
    });
  };
  try {
    let response = await request(requestBody);
    if (!response.ok) {
      await logResponseError(response);
      const { response_format: _responseFormat, ...retryBody } = requestBody;
      response = await request(retryBody);
      if (!response.ok) {
        await logResponseError(response);
        throw HttpError.badGateway('Falha ao consultar o provedor de IA');
      }
    }
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as { model?: unknown }).model !== 'string' ||
      !Array.isArray((data as { choices?: unknown }).choices) ||
      typeof (data as { choices: Array<{ message?: { content?: unknown } }> })
        .choices[0]?.message?.content !== 'string'
    ) {
      const serialized = JSON.stringify(data) ?? String(data);
      logError('callOpenRouter.unexpectedResponse', {
        snippet: serialized.slice(0, 500),
      });
      throw HttpError.badGateway('Falha ao consultar o provedor de IA');
    }
    const result = data as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };
    return { content: result.choices[0].message.content, model: result.model };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as HttpError).statusCode === 502
    ) {
      throw error;
    }
    logError('callOpenRouter.failed', {
      message: (error as Error).message,
    });
    throw HttpError.badGateway('Falha ao consultar o provedor de IA');
  } finally {
    clearTimeout(timeout);
  }
}
