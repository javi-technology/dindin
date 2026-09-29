import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/api/api_config.dart';

void main() {
  group('endereço dos emuladores', () {
    test('usa o Hosting emulator para preservar o rewrite /api', () {
      expect(apiBaseUrlDoEmulador('127.0.0.1'), 'http://127.0.0.1:5002');
    });

    test('aceita o IP da máquina para aparelho físico', () {
      expect(apiBaseUrlDoEmulador('192.168.1.20'), 'http://192.168.1.20:5002');
    });
  });
}
