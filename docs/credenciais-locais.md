# Credenciais locais sem chave de longa duração

Como rodar os scripts administrativos de `apps/api/src/scripts/` contra o
projeto `dindin-4e720` sem uma chave JSON de service account (issue #514).

## Por que não usar uma chave JSON

Uma chave de service account não expira e dá o mesmo acesso a quem a tiver: um
arquivo esquecido na raiz do repositório, num backup ou numa máquina
emprestada vale como senha do projeto. O CI já autentica por Workload Identity
(`docs/deploy-workload-identity.md`), com credencial que dura minutos. Para a
máquina de desenvolvimento vale o mesmo princípio.

O arquivo continua no `.gitignore` (`sa-key.json`, `service-account*.json` e
`*-sa-key.json`), mas o `.gitignore` só evita o commit: não evita que a chave
exista.

## Opção 1: a sua própria conta (recomendada)

O SDK do Firebase Admin lê as _Application Default Credentials_, e o `gcloud`
as gera a partir do seu login:

```bash
gcloud auth application-default login
gcloud config set project dindin-4e720
```

Os scripts agem com as **suas** permissões no projeto, e o rastro de auditoria
do GCP aponta para a pessoa, não para uma conta compartilhada. A credencial é
renovada pelo `gcloud` e some com `gcloud auth application-default revoke`.

## Opção 2: personificar a service account

Para um script que precise das permissões da service account (e não das
suas), personifique-a. O token dura pouco e nenhum arquivo é gravado:

```bash
gcloud auth application-default login \
  --impersonate-service-account=<SERVICE_ACCOUNT_EMAIL>
```

Exige o papel `roles/iam.serviceAccountTokenCreator` na service account para
a sua conta. Quem concede é um administrador do projeto:

```bash
gcloud iam service-accounts add-iam-policy-binding <SERVICE_ACCOUNT_EMAIL> \
  --member="user:<SEU_EMAIL>" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project dindin-4e720
```

## Rodando um script

Com a credencial acima, não há variável a definir:

```bash
npm run seed:assets --workspace=apps/api
npm run migrate:legacy --workspace=apps/api            # simula
npm run migrate:legacy --workspace=apps/api -- --apply # grava
```

Sem credencial, os scripts param com uma mensagem que aponta para este guia.
Para ensaiar sem tocar em produção, use o emulador (`FIRESTORE_EMULATOR_HOST`
e, no Auth, `FIREBASE_AUTH_EMULATOR_HOST`), que dispensa credencial.

## Se já existe uma chave JSON

1. Confira se algo ainda a usa. A chave não é necessária para o CI nem para os
   scripts, pelos caminhos acima.
2. Liste as chaves da service account e identifique a do arquivo local pelo
   campo `private_key_id` do JSON:

   ```bash
   gcloud iam service-accounts keys list \
     --iam-account=<SERVICE_ACCOUNT_EMAIL> --project dindin-4e720
   ```

3. Revogue-a no GCP **antes** de apagar o arquivo, porque apagar o arquivo não
   desativa a chave:

   ```bash
   gcloud iam service-accounts keys delete <KEY_ID> \
     --iam-account=<SERVICE_ACCOUNT_EMAIL> --project dindin-4e720
   ```

4. Apague o arquivo local.
5. Revise os papéis da service account no console (IAM) e deixe só o que os
   scripts e o deploy exigem.
