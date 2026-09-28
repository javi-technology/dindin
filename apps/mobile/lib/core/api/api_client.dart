import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/token_provider.dart';
import 'api_exception.dart';

/// Cliente HTTP da API do DinDin.
///
/// O backend valida ID token do Firebase e não muda para o app: o que este
/// cliente acrescenta é mandar o token em toda requisição e **renovar o
/// vencido sem o usuário perceber** — deslogar no meio de um envio é perder
/// o dado financeiro que ele acabou de digitar.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required TokenProvider tokenProvider,
    http.Client? httpClient,
  }) : _baseUrl = Uri.parse(baseUrl),
       _tokens = tokenProvider,
       _http = httpClient ?? http.Client();

  final Uri _baseUrl;
  final TokenProvider _tokens;
  final http.Client _http;

  Future<dynamic> get(String caminho, {Map<String, String>? query}) =>
      _enviar('GET', caminho, query: query);

  Future<dynamic> post(String caminho, {Object? body}) =>
      _enviar('POST', caminho, body: body);

  Future<dynamic> put(String caminho, {Object? body}) =>
      _enviar('PUT', caminho, body: body);

  Future<dynamic> delete(String caminho) => _enviar('DELETE', caminho);

  Future<dynamic> _enviar(
    String metodo,
    String caminho, {
    Map<String, String>? query,
    Object? body,
    bool jaRenovou = false,
  }) async {
    final resposta = await _executar(metodo, caminho, query, body, jaRenovou);

    // Um 401 costuma ser só token vencido: renova à força e repete a
    // requisição uma vez. Mais de uma repetição viraria laço quando a sessão
    // realmente acabou, então o segundo 401 é definitivo.
    if (resposta.statusCode == 401 && !jaRenovou) {
      return _enviar(
        metodo,
        caminho,
        query: query,
        body: body,
        jaRenovou: true,
      );
    }

    return _interpretar(resposta);
  }

  Future<http.Response> _executar(
    String metodo,
    String caminho,
    Map<String, String>? query,
    Object? body,
    bool renovar,
  ) async {
    final uri = _baseUrl.replace(
      path: caminho,
      queryParameters: query?.isEmpty ?? true ? null : query,
    );

    final requisicao = http.Request(metodo, uri);

    final token = await _tokens.idToken(forceRefresh: renovar);
    // Sem sessão a requisição segue sem o cabeçalho: `/api/health` não exige
    // token, e mandar `Bearer null` transformaria isso num 401.
    if (token != null) {
      requisicao.headers['Authorization'] = 'Bearer $token';
    }
    if (body != null) {
      requisicao.headers['Content-Type'] = 'application/json; charset=utf-8';
      requisicao.body = jsonEncode(body);
    }

    try {
      return await http.Response.fromStream(await _http.send(requisicao));
    } on ApiException {
      rethrow;
    } catch (erro) {
      throw NetworkException(erro);
    }
  }

  dynamic _interpretar(http.Response resposta) {
    final corpo = _decodificar(resposta);

    if (resposta.statusCode >= 200 && resposta.statusCode < 300) {
      return corpo;
    }

    final mensagem = corpo is Map<String, dynamic> ? corpo['error'] : null;
    final code = corpo is Map<String, dynamic> ? corpo['code'] : null;

    if (resposta.statusCode == 401) {
      throw UnauthorizedException(
        message: mensagem is String ? mensagem : null,
        code: code is String ? code : null,
      );
    }

    throw ApiException(
      statusCode: resposta.statusCode,
      message: mensagem is String
          ? mensagem
          : 'Não foi possível completar a operação.',
      code: code is String ? code : null,
    );
  }

  dynamic _decodificar(http.Response resposta) {
    // 204 e 401 chegam sem corpo; tratar isso como JSON inválido esconderia
    // o status por trás de um erro de parsing.
    if (resposta.bodyBytes.isEmpty) return null;

    // A API declara `charset=utf-8`, e é por isso que os bytes vêm primeiro:
    // `resposta.body` usa o charset do cabeçalho e cai para latin1 quando ele
    // falta, o que transformaria "não encontrada" em texto quebrado na tela.
    // O caminho inverso cobre quem não declara o charset.
    for (final texto in [
      () => utf8.decode(resposta.bodyBytes),
      () => resposta.body,
    ]) {
      try {
        return jsonDecode(texto());
      } catch (_) {
        continue;
      }
    }

    return null;
  }

  void close() => _http.close();
}
