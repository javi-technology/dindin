import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dindin_mobile/core/auth/firebase_auth_backend.dart';

// ---------------------------------------------------------------------------
// Inicialização do Google Sign-In (issue #400).
//
// A partir da versão 7 o pacote exige `initialize()` antes de qualquer outra
// chamada; sem ela, `authenticate()` falha no aparelho. É um erro que não
// aparece em teste de widget nem na análise estática — só no celular, no
// momento em que o usuário tenta entrar.
// ---------------------------------------------------------------------------

class _GoogleSignInMock extends Mock implements GoogleSignIn {}

class _FirebaseAuthMock extends Mock implements fb.FirebaseAuth {}

class _ContaMock extends Mock implements GoogleSignInAccount {}

class _AutenticacaoMock extends Mock implements GoogleSignInAuthentication {}

class _CredencialFalsa extends Fake implements fb.AuthCredential {}

void main() {
  setUpAll(() {
    registerFallbackValue(_CredencialFalsa());
  });

  late _GoogleSignInMock google;
  late _FirebaseAuthMock auth;
  late FirebaseAuthBackend backend;

  setUp(() {
    google = _GoogleSignInMock();
    auth = _FirebaseAuthMock();

    final autenticacao = _AutenticacaoMock();
    when(() => autenticacao.idToken).thenReturn('token-do-google');

    final conta = _ContaMock();
    when(() => conta.authentication).thenReturn(autenticacao);

    when(
      () => google.initialize(
        clientId: any(named: 'clientId'),
        serverClientId: any(named: 'serverClientId'),
        nonce: any(named: 'nonce'),
        hostedDomain: any(named: 'hostedDomain'),
      ),
    ).thenAnswer((_) async {});
    when(() => google.authenticate()).thenAnswer((_) async => conta);
    when(() => auth.signInWithCredential(any())).thenAnswer(
      (_) async => throw UnimplementedError('credencial não usada no teste'),
    );

    backend = FirebaseAuthBackend(auth: auth, google: google);
  });

  test('inicializa o Google Sign-In antes de autenticar', () async {
    await backend.entrarComGoogle().catchError((_) {});

    verifyInOrder([
      () => google.initialize(
        clientId: any(named: 'clientId'),
        serverClientId: any(named: 'serverClientId'),
        nonce: any(named: 'nonce'),
        hostedDomain: any(named: 'hostedDomain'),
      ),
      () => google.authenticate(),
    ]);
  });

  // A inicialização é do pacote, não da sessão: repeti-la a cada login seria
  // trabalho à toa no caminho em que o usuário já está esperando.
  test('inicializa uma única vez entre logins', () async {
    await backend.entrarComGoogle().catchError((_) {});
    await backend.entrarComGoogle().catchError((_) {});

    verify(
      () => google.initialize(
        clientId: any(named: 'clientId'),
        serverClientId: any(named: 'serverClientId'),
        nonce: any(named: 'nonce'),
        hostedDomain: any(named: 'hostedDomain'),
      ),
    ).called(1);
    verify(() => google.authenticate()).called(2);
  });
}
