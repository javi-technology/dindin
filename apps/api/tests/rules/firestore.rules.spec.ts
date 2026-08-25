import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const rulesPath = path.resolve(__dirname, '../../../../firestore.rules');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'dindin-test',
    firestore: {
      rules: fs.readFileSync(rulesPath, 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

describe('Firestore rules – users', () => {
  it('deve permitir que usuário leia seu próprio documento', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = doc(alice.firestore(), 'users/alice');

    await assertSucceeds(setDoc(ref, { email: 'alice@example.com' }));
    await assertSucceeds(getDoc(ref));
  });

  it('deve negar que usuário leia documento de outro usuário', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');

    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users/alice'), {
        email: 'alice@example.com',
      }),
    );
    await assertFails(getDoc(doc(bob.firestore(), 'users/alice')));
  });

  it('deve negar acesso não autenticado a users', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), 'users/alice')));
  });
});

// ---------------------------------------------------------------------------
// wallets
// ---------------------------------------------------------------------------

describe('Firestore rules – wallets', () => {
  it('deve permitir que usuário autenticado leia suas próprias wallets', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = doc(alice.firestore(), 'users/alice/wallets/main');

    await assertSucceeds(setDoc(ref, { balance: 100 }));
    const snapshot = await assertSucceeds(getDoc(ref));

    expect(snapshot.exists()).toBe(true);
    expect(snapshot.data()?.balance).toBe(100);
  });

  it('deve negar que usuário leia wallets de outro usuário', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');

    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users/alice/wallets/main'), {
        balance: 100,
      }),
    );
    await assertFails(getDoc(doc(bob.firestore(), 'users/alice/wallets/main')));
  });

  it('deve negar que usuário escreva em wallets de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(bob.firestore(), 'users/alice/wallets/main'), {
        balance: 100,
      }),
    );
  });

  it('deve negar acesso não autenticado a wallets', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(unauth.firestore(), 'users/alice/wallets/main')),
    );
  });
});

// ---------------------------------------------------------------------------
// positions
// ---------------------------------------------------------------------------

describe('Firestore rules – positions', () => {
  it('deve permitir que usuário leia suas próprias positions', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = doc(
      alice.firestore(),
      'users/alice/wallets/main/positions/HGLG11',
    );

    await assertSucceeds(setDoc(ref, { ticker: 'HGLG11', quantity: 10 }));
    const snapshot = await assertSucceeds(getDoc(ref));

    expect(snapshot.data()?.ticker).toBe('HGLG11');
  });

  it('deve negar que usuário leia positions de outro usuário', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');

    await assertSucceeds(
      setDoc(
        doc(alice.firestore(), 'users/alice/wallets/main/positions/HGLG11'),
        { ticker: 'HGLG11' },
      ),
    );
    await assertFails(
      getDoc(doc(bob.firestore(), 'users/alice/wallets/main/positions/HGLG11')),
    );
  });

  it('deve negar que usuário escreva em positions de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(
        doc(bob.firestore(), 'users/alice/wallets/main/positions/HGLG11'),
        { ticker: 'HGLG11' },
      ),
    );
  });

  it('deve negar acesso não autenticado a positions', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(
        doc(unauth.firestore(), 'users/alice/wallets/main/positions/HGLG11'),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// fridges
// ---------------------------------------------------------------------------

describe('Firestore rules – fridges', () => {
  it('deve permitir que usuário leia suas próprias fridges', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = doc(alice.firestore(), 'users/alice/fridges/principal');

    await assertSucceeds(setDoc(ref, { name: 'Geladeira Principal' }));
    const snapshot = await assertSucceeds(getDoc(ref));

    expect(snapshot.data()?.name).toBe('Geladeira Principal');
  });

  it('deve negar que usuário leia fridges de outro usuário', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');

    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users/alice/fridges/principal'), {
        name: 'Geladeira Principal',
      }),
    );
    await assertFails(
      getDoc(doc(bob.firestore(), 'users/alice/fridges/principal')),
    );
  });

  it('deve negar que usuário escreva em fridges de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(bob.firestore(), 'users/alice/fridges/principal'), {
        name: 'Geladeira Principal',
      }),
    );
  });

  it('deve negar acesso não autenticado a fridges', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(unauth.firestore(), 'users/alice/fridges/principal')),
    );
  });
});

// ---------------------------------------------------------------------------
// fridgeItems
// ---------------------------------------------------------------------------

describe('Firestore rules – fridgeItems', () => {
  it('deve permitir que usuário leia seus próprios fridgeItems', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = doc(
      alice.firestore(),
      'users/alice/fridges/principal/fridgeItems/XPML11',
    );

    await assertSucceeds(setDoc(ref, { ticker: 'XPML11', targetPrice: 100 }));
    const snapshot = await assertSucceeds(getDoc(ref));

    expect(snapshot.data()?.ticker).toBe('XPML11');
  });

  it('deve negar que usuário leia fridgeItems de outro usuário', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');

    await assertSucceeds(
      setDoc(
        doc(
          alice.firestore(),
          'users/alice/fridges/principal/fridgeItems/XPML11',
        ),
        { ticker: 'XPML11' },
      ),
    );
    await assertFails(
      getDoc(
        doc(
          bob.firestore(),
          'users/alice/fridges/principal/fridgeItems/XPML11',
        ),
      ),
    );
  });

  it('deve negar que usuário escreva em fridgeItems de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(
        doc(
          bob.firestore(),
          'users/alice/fridges/principal/fridgeItems/XPML11',
        ),
        { ticker: 'XPML11' },
      ),
    );
  });

  it('deve negar acesso não autenticado a fridgeItems', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(
        doc(
          unauth.firestore(),
          'users/alice/fridges/principal/fridgeItems/XPML11',
        ),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// dividends
// ---------------------------------------------------------------------------

describe('Firestore rules – dividends', () => {
  it('deve permitir que usuário leia seus próprios dividends', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = doc(alice.firestore(), 'users/alice/dividends/div-1');

    await assertSucceeds(
      setDoc(ref, {
        ticker: 'HGLG11',
        amountPerShare: 0.82,
        quantity: 100,
        totalAmount: 82,
        paymentDate: '2026-01-15',
      }),
    );
    const snapshot = await assertSucceeds(getDoc(ref));

    expect(snapshot.data()?.ticker).toBe('HGLG11');
  });

  it('deve negar que usuário leia dividends de outro usuário', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');

    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users/alice/dividends/div-1'), {
        ticker: 'HGLG11',
        amountPerShare: 0.82,
        quantity: 100,
        totalAmount: 82,
        paymentDate: '2026-01-15',
      }),
    );
    await assertFails(
      getDoc(doc(bob.firestore(), 'users/alice/dividends/div-1')),
    );
  });

  it('deve negar que usuário escreva em dividends de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(bob.firestore(), 'users/alice/dividends/div-1'), {
        ticker: 'HGLG11',
        amountPerShare: 0.82,
        quantity: 100,
        totalAmount: 82,
        paymentDate: '2026-01-15',
      }),
    );
  });

  it('deve negar acesso não autenticado a dividends', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(unauth.firestore(), 'users/alice/dividends/div-1')),
    );
  });
});

// ---------------------------------------------------------------------------
// assets (catálogo de ativos suportados)
// ---------------------------------------------------------------------------

describe('Firestore rules – assets', () => {
  it('deve permitir que usuário autenticado leia o catálogo de ativos', async () => {
    // Escrita direta pelo client não é permitida; popula via contexto admin
    // simulando o seed/admin SDK, que ignora as regras de segurança.
    const admin = testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), 'assets/HGLG11'), {
        ticker: 'HGLG11',
        name: 'CSHG Logística',
        assetType: 'FII',
        active: true,
      }),
    );
    await admin;

    const alice = testEnv.authenticatedContext('alice');
    const snapshot = await assertSucceeds(
      getDoc(doc(alice.firestore(), 'assets/HGLG11')),
    );
    expect(snapshot.data()?.ticker).toBe('HGLG11');
  });

  it('deve negar escrita de assets por qualquer usuário autenticado', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), 'assets/HGLG11'), { ticker: 'HGLG11' }),
    );
  });

  it('deve negar acesso não autenticado a assets', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), 'assets/HGLG11')));
  });
});

// ---------------------------------------------------------------------------
// coleções fora do escopo
// ---------------------------------------------------------------------------

describe('Firestore rules – coleções fora do escopo', () => {
  it('deve negar acesso a coleções raiz não mapeadas', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = doc(alice.firestore(), 'public/config');

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { value: 'x' }));
  });
});
