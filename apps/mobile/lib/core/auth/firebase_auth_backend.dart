import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:google_sign_in/google_sign_in.dart';

import 'auth_backend.dart';
import 'auth_exception.dart';
import 'sessao.dart';

/// [AuthBackend] sobre o Firebase Auth e o Google Sign-In nativos.
///
/// É a única parte do app que conhece o SDK. A persistência da sessão vem de
/// graça aqui — o `firebase_auth` restaura o usuário do disco na abertura e o
/// publica em `authStateChanges` —, e é por isso que o app não guarda token
/// por conta própria: token escrito à mão em `SharedPreferences` vence sem
/// aviso e não é renovável.
class FirebaseAuthBackend implements AuthBackend {
  FirebaseAuthBackend({fb.FirebaseAuth? auth, GoogleSignIn? google})
    : _auth = auth ?? fb.FirebaseAuth.instance,
      _google = google ?? GoogleSignIn.instance;

  final fb.FirebaseAuth _auth;
  final GoogleSignIn _google;

  @override
  Stream<Sessao?> get sessoes => _auth.authStateChanges().map(_converter);

  @override
  Sessao? get sessaoAtual => _converter(_auth.currentUser);

  Sessao? _converter(fb.User? user) => user == null
      ? null
      : Sessao(uid: user.uid, email: user.email, displayName: user.displayName);

  @override
  Future<void> entrarComEmail(String email, String senha) => _traduzindo(
    () => _auth.signInWithEmailAndPassword(email: email, password: senha),
  );

  @override
  Future<void> cadastrarComEmail(String email, String senha) => _traduzindo(
    () => _auth.createUserWithEmailAndPassword(email: email, password: senha),
  );

  @override
  Future<void> entrarComGoogle() => _traduzindo(() async {
    final conta = await _google.authenticate();
    final autenticacao = conta.authentication;

    final credencial = fb.GoogleAuthProvider.credential(
      idToken: autenticacao.idToken,
    );

    await _auth.signInWithCredential(credencial);
  });

  @override
  Future<void> sair() async {
    // A conta do Google também é desconectada: sem isso, o próximo login
    // reentra na mesma conta sem perguntar, e quem trocou de usuário no
    // aparelho não consegue mais escolher.
    await _google.signOut();
    await _auth.signOut();
  }

  @override
  Future<String?> idToken({bool forceRefresh = false}) =>
      _auth.currentUser?.getIdToken(forceRefresh) ?? Future.value(null);

  /// Converte a falha do SDK em `CodigoDeAuth`; a tradução para a tela é do
  /// `AuthService`, que é onde ela pode ser testada sem Firebase.
  Future<void> _traduzindo(Future<void> Function() acao) async {
    try {
      await acao();
    } on fb.FirebaseAuthException catch (erro) {
      throw CodigoDeAuth(erro.code, message: erro.message);
    } on GoogleSignInException catch (erro) {
      throw CodigoDeAuth(
        erro.code == GoogleSignInExceptionCode.canceled
            ? 'cancelado-pelo-usuario'
            : erro.code.name,
        message: erro.description,
      );
    }
  }
}
