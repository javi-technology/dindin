import 'package:flutter/material.dart';

import '../../core/auth/auth_exception.dart';

/// Tela de login com e-mail e senha e com Google (issue #400).
///
/// Recebe as ações por parâmetro em vez de alcançar o `AuthService` por conta
/// própria: é o que permite testá-la sem Firebase, e o app Flutter é testado
/// sem navegador nem emulador.
class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.aoEntrarComEmail,
    required this.aoEntrarComGoogle,
    this.aoCadastrar,
  });

  final Future<void> Function(String email, String senha) aoEntrarComEmail;
  final Future<void> Function() aoEntrarComGoogle;
  final Future<void> Function(String email, String senha)? aoCadastrar;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formulario = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _senha = TextEditingController();

  bool _enviando = false;
  String? _erro;

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    super.dispose();
  }

  /// Executa a ação impedindo o segundo envio.
  ///
  /// No celular o usuário toca de novo quando a resposta demora; sem isso, um
  /// cadastro viraria dois.
  Future<void> _enviar(Future<void> Function() acao) async {
    if (_enviando) return;

    setState(() {
      _enviando = true;
      _erro = null;
    });

    try {
      await acao();
    } on LoginCanceladoException {
      // Desistir da folha do Google é escolha do usuário, não falha: a tela
      // apenas volta ao estado anterior, sem erro vermelho.
    } on AuthException catch (erro) {
      if (mounted) setState(() => _erro = erro.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Future<void> _entrarComEmail() async {
    if (!_formulario.currentState!.validate()) return;

    await _enviar(() => widget.aoEntrarComEmail(_email.text, _senha.text));
  }

  String? _validarEmail(String? valor) {
    final texto = valor?.trim() ?? '';
    if (texto.isEmpty) return 'Informe o e-mail.';
    // Validação deliberadamente frouxa: o que se quer pegar aqui é o erro de
    // digitação óbvio; quem diz se o e-mail existe é o servidor.
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(texto)) {
      return 'E-mail inválido.';
    }
    return null;
  }

  String? _validarSenha(String? valor) =>
      (valor ?? '').isEmpty ? 'Informe a senha.' : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formulario,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'DinDin',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 32),
                  TextFormField(
                    key: const Key('campo-email'),
                    controller: _email,
                    decoration: const InputDecoration(labelText: 'E-mail'),
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    validator: _validarEmail,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    key: const Key('campo-senha'),
                    controller: _senha,
                    decoration: const InputDecoration(labelText: 'Senha'),
                    obscureText: true,
                    validator: _validarSenha,
                  ),
                  if (_erro != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _erro!,
                      key: const Key('erro-login'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    key: const Key('botao-entrar'),
                    onPressed: _enviando ? null : _entrarComEmail,
                    child: Text(_enviando ? 'Entrando…' : 'Entrar'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    key: const Key('botao-google'),
                    onPressed: _enviando
                        ? null
                        : () => _enviar(widget.aoEntrarComGoogle),
                    child: const Text('Entrar com Google'),
                  ),
                  if (widget.aoCadastrar != null) ...[
                    const SizedBox(height: 12),
                    TextButton(
                      key: const Key('botao-cadastrar'),
                      onPressed: _enviando
                          ? null
                          : () async {
                              if (!_formulario.currentState!.validate()) return;
                              await _enviar(
                                () => widget.aoCadastrar!(
                                  _email.text,
                                  _senha.text,
                                ),
                              );
                            },
                      child: const Text('Criar conta'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
