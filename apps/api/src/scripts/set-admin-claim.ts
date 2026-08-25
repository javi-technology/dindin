/**
 * Script utilitário para conceder a custom claim `admin: true` a um usuário
 * do Firebase Auth. Útil para testar rotas administrativas localmente com
 * os emuladores do Firebase.
 *
 * Uso (a partir de apps/api, com os emuladores rodando):
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     npm run set:admin-claim -- UID_DO_USUARIO
 *
 * Em produção, remova a variável FIREBASE_AUTH_EMULATOR_HOST e use
 * GOOGLE_APPLICATION_CREDENTIALS com uma service account.
 */
import * as admin from 'firebase-admin';

const uid = process.argv[2];

if (!uid) {
  console.error(
    '[setAdminClaim] UID do usuário não informado.\nUso: npm run set:admin-claim -- <uid>',
  );
  process.exitCode = 1;
  // eslint-disable-next-line no-process-exit
  process.exit(1);
}

async function setAdminClaim(): Promise<void> {
  admin.initializeApp({ projectId: 'dindin-4e720' });

  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log(`[setAdminClaim] admin: true aplicado ao uid ${uid}`);
}

setAdminClaim().catch((error) => {
  console.error('[setAdminClaim] error:', error);
  process.exitCode = 1;
});
