/// Usuário autenticado, na medida em que o app precisa dele.
///
/// O `User` do `firebase_auth` carrega dezenas de campos e amarra qualquer
/// tela que o toque ao SDK. O app trabalha com este recorte, e a fronteira
/// com o Firebase fica em [AuthBackend].
class Sessao {
  const Sessao({required this.uid, this.email, this.displayName});

  final String uid;
  final String? email;
  final String? displayName;

  @override
  bool operator ==(Object other) =>
      other is Sessao &&
      other.uid == uid &&
      other.email == email &&
      other.displayName == displayName;

  @override
  int get hashCode => Object.hash(uid, email, displayName);
}
