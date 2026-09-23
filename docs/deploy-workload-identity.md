# Deploy no GCP com Workload Identity Federation

Runbook da configuração exigida pela issue #322. O pipeline deixou de usar a
chave JSON de longa duração do secret `FIREBASE_SERVICE_ACCOUNT`: o GitHub emite
um token OIDC por execução e o GCP o troca por uma credencial de curta duração.

Uma chave estática dá acesso ao projeto até alguém revogá-la à mão; o token da
federação vale minutos e só é emitido para execuções deste repositório.

## O que o repositório já espera

Os workflows `ci-cd.yml` e `backfill-dividend-history.yml` usam duas variáveis de
repositório — **variáveis, não secrets**, porque identificam recursos e não são
credenciais:

| Variável              | Conteúdo                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `WIF_PROVIDER`        | `projects/<NUMERO>/locations/global/workloadIdentityPools/github-actions/providers/github-actions` |
| `WIF_SERVICE_ACCOUNT` | E-mail da service account usada no deploy                                                          |

Ambos os jobs declaram `id-token: write`, sem o que o GitHub não emite o token.

## Passo a passo

Os comandos assumem `gcloud` autenticado com permissão de administrador no
projeto `dindin-4e720`.

### 1. Descobrir o número do projeto

```bash
gcloud projects describe dindin-4e720 --format='value(projectNumber)'
```

O valor entra no lugar de `<NUMERO>` nos passos seguintes.

### 2. Habilitar as APIs

```bash
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  --project dindin-4e720
```

### 3. Criar o pool

```bash
gcloud iam workload-identity-pools create github-actions \
  --project dindin-4e720 --location global \
  --display-name 'GitHub Actions'
```

### 4. Criar o provider

A condição de atributo é o controle de segurança central: sem ela, **qualquer
repositório do GitHub** poderia trocar um token por credencial deste projeto.

```bash
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --project dindin-4e720 --location global \
  --workload-identity-pool github-actions \
  --display-name 'GitHub Actions' \
  --issuer-uri 'https://token.actions.githubusercontent.com' \
  --attribute-mapping 'google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner' \
  --attribute-condition "assertion.repository_owner == 'javi-technology'"
```

### 5. Autorizar a service account

Descubra a service account em uso hoje:

```bash
gcloud iam service-accounts list --project dindin-4e720
```

E autorize só as execuções deste repositório a assumi-la:

```bash
gcloud iam service-accounts add-iam-policy-binding <SERVICE_ACCOUNT_EMAIL> \
  --project dindin-4e720 \
  --role roles/iam.workloadIdentityUser \
  --member 'principalSet://iam.googleapis.com/projects/<NUMERO>/locations/global/workloadIdentityPools/github-actions/attribute.repository/javi-technology/dindin'
```

### 6. Publicar as variáveis no repositório

```bash
gh variable set WIF_PROVIDER --repo javi-technology/dindin \
  --body 'projects/<NUMERO>/locations/global/workloadIdentityPools/github-actions/providers/github-actions'

gh variable set WIF_SERVICE_ACCOUNT --repo javi-technology/dindin \
  --body '<SERVICE_ACCOUNT_EMAIL>'
```

### 7. Validar antes de remover a chave

Faça um push na `main` e confirme que o job `Deploy to Firebase` autentica e
publica. **Só depois** remova a credencial antiga:

```bash
gh secret delete FIREBASE_SERVICE_ACCOUNT --repo javi-technology/dindin

gcloud iam service-accounts keys list --iam-account <SERVICE_ACCOUNT_EMAIL> \
  --project dindin-4e720
gcloud iam service-accounts keys delete <KEY_ID> \
  --iam-account <SERVICE_ACCOUNT_EMAIL> --project dindin-4e720
```

A ordem importa: enquanto o deploy pela federação não tiver passado uma vez, a
chave é o único caminho de volta.

## Se o deploy falhar

- `unable to get credentials` ou `403` na troca do token: confira se
  `WIF_PROVIDER` está com o **número** do projeto, não com o id textual.
- `Permission 'iam.serviceAccounts.getAccessToken' denied`: o binding do passo 5
  não foi aplicado, ou o `principalSet` não bate com `owner/repo`.
- Token não emitido: falta `id-token: write` nas permissões do job.
