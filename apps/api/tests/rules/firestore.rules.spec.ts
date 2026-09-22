import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
// Coleções de domínio (issue #218)
//
// Toda escrita nas coleções de domínio passa pela API, que valida moeda,
// tipo de ativo, quantidade e preço antes de gravar. O frontend nunca escreve
// direto no Firestore — só consome a API via HttpClient. Por isso as regras
// concedem apenas leitura ao proprietário: escrita é exclusiva do Admin SDK,
// que ignora as regras. Assim não há caminho que contorne a validação.
//
// Como consequência, os testes semeiam dados via `withSecurityRulesDisabled`
// (mesmo padrão já usado em `assets` e `patrimonySnapshots`), e não mais
// escrevendo pelo contexto do cliente.
// ---------------------------------------------------------------------------

/** Semeia um documento ignorando as regras, simulando a API/Admin SDK. */
function seed(path: string, data: Record<string, unknown>): Promise<void> {
  return testEnv.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), path), data),
  );
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

describe('Firestore rules – users', () => {
  const userPath = 'users/alice';

  it('deve negar que o proprietário leia o próprio documento', async () => {
    await seed(userPath, { email: 'alice@example.com' });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(getDoc(doc(alice.firestore(), userPath)));
  });

  it('deve negar que o proprietário escreva no próprio documento', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), userPath), { email: 'alice@example.com' }),
    );
  });

  it('deve negar que usuário leia documento de outro usuário', async () => {
    await seed(userPath, { email: 'alice@example.com' });
    const bob = testEnv.authenticatedContext('bob');

    await assertFails(getDoc(doc(bob.firestore(), userPath)));
  });

  it('deve negar acesso não autenticado a users', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), userPath)));
  });
});

// ---------------------------------------------------------------------------
// wallets
// ---------------------------------------------------------------------------

describe('Firestore rules – wallets', () => {
  const walletPath = 'users/alice/wallets/main';

  it('deve negar que o proprietário leia as próprias wallets', async () => {
    await seed(walletPath, { balance: 100 });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(getDoc(doc(alice.firestore(), walletPath)));
  });

  it('deve negar que o proprietário crie wallets', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), walletPath), { balance: 100 }),
    );
  });

  it('deve negar que o proprietário atualize wallets', async () => {
    await seed(walletPath, { balance: 100 });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(
      updateDoc(doc(alice.firestore(), walletPath), { balance: 999 }),
    );
  });

  it('deve negar que o proprietário exclua wallets', async () => {
    await seed(walletPath, { balance: 100 });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(deleteDoc(doc(alice.firestore(), walletPath)));
  });

  it('deve negar que usuário leia wallets de outro usuário', async () => {
    await seed(walletPath, { balance: 100 });
    const bob = testEnv.authenticatedContext('bob');

    await assertFails(getDoc(doc(bob.firestore(), walletPath)));
  });

  it('deve negar que usuário escreva em wallets de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(bob.firestore(), walletPath), { balance: 100 }),
    );
  });

  it('deve negar acesso não autenticado a wallets', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), walletPath)));
  });
});

// ---------------------------------------------------------------------------
// positions
// ---------------------------------------------------------------------------

describe('Firestore rules – positions', () => {
  const positionPath = 'users/alice/wallets/main/positions/pos-1';

  it('deve negar que o proprietário leia as próprias positions', async () => {
    await seed(positionPath, { ticker: 'HGLG11', quantity: 10 });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(getDoc(doc(alice.firestore(), positionPath)));
  });

  it('deve negar que o proprietário crie positions', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), positionPath), {
        ticker: 'HGLG11',
        quantity: 10,
      }),
    );
  });

  // Regressão do motivo da issue: sem esta regra o cliente gravaria uma
  // posição com quantidade negativa, que a API rejeitaria com 400.
  it('deve negar que o proprietário grave quantidade inválida direto', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), positionPath), {
        ticker: 'HGLG11',
        quantity: -999,
        assetType: 'INVALIDO',
      }),
    );
  });

  it('deve negar que o proprietário exclua positions', async () => {
    await seed(positionPath, { ticker: 'HGLG11', quantity: 10 });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(deleteDoc(doc(alice.firestore(), positionPath)));
  });

  it('deve negar que usuário leia positions de outro usuário', async () => {
    await seed(positionPath, { ticker: 'HGLG11', quantity: 10 });
    const bob = testEnv.authenticatedContext('bob');

    await assertFails(getDoc(doc(bob.firestore(), positionPath)));
  });

  it('deve negar que usuário escreva em positions de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(bob.firestore(), positionPath), { ticker: 'HGLG11' }),
    );
  });

  it('deve negar acesso não autenticado a positions', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), positionPath)));
  });
});

// ---------------------------------------------------------------------------
// fridges
// ---------------------------------------------------------------------------

describe('Firestore rules – fridges', () => {
  const fridgePath = 'users/alice/fridges/fridge-1';

  it('deve negar que o proprietário leia as próprias fridges', async () => {
    await seed(fridgePath, { name: 'Geladeira Principal' });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(getDoc(doc(alice.firestore(), fridgePath)));
  });

  it('deve negar que o proprietário escreva em fridges', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), fridgePath), { name: 'Geladeira' }),
    );
  });

  it('deve negar que usuário leia fridges de outro usuário', async () => {
    await seed(fridgePath, { name: 'Geladeira Principal' });
    const bob = testEnv.authenticatedContext('bob');

    await assertFails(getDoc(doc(bob.firestore(), fridgePath)));
  });

  it('deve negar que usuário escreva em fridges de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(bob.firestore(), fridgePath), { name: 'Geladeira' }),
    );
  });

  it('deve negar acesso não autenticado a fridges', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), fridgePath)));
  });
});

// ---------------------------------------------------------------------------
// fridgeItems
// ---------------------------------------------------------------------------

describe('Firestore rules – fridgeItems', () => {
  const itemPath = 'users/alice/fridges/fridge-1/fridgeItems/item-1';

  it('deve negar que o proprietário leia os próprios fridgeItems', async () => {
    await seed(itemPath, { ticker: 'XPML11', targetPrice: 100 });
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(getDoc(doc(alice.firestore(), itemPath)));
  });

  it('deve negar que o proprietário escreva em fridgeItems', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), itemPath), { ticker: 'XPML11' }),
    );
  });

  it('deve negar que usuário leia fridgeItems de outro usuário', async () => {
    await seed(itemPath, { ticker: 'XPML11', targetPrice: 100 });
    const bob = testEnv.authenticatedContext('bob');

    await assertFails(getDoc(doc(bob.firestore(), itemPath)));
  });

  it('deve negar que usuário escreva em fridgeItems de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(bob.firestore(), itemPath), { ticker: 'XPML11' }),
    );
  });

  it('deve negar acesso não autenticado a fridgeItems', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), itemPath)));
  });
});

// ---------------------------------------------------------------------------
// dividends
// ---------------------------------------------------------------------------

describe('Firestore rules – dividends', () => {
  const dividendPath = 'users/alice/dividends/div-1';
  const dividend = {
    ticker: 'HGLG11',
    amountPerShare: 0.82,
    quantity: 100,
    totalAmount: 82,
    paymentDate: '2026-01-15',
  };

  it('deve negar que o proprietário leia os próprios dividends', async () => {
    await seed(dividendPath, dividend);
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(getDoc(doc(alice.firestore(), dividendPath)));
  });

  it('deve negar que o proprietário escreva em dividends', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(setDoc(doc(alice.firestore(), dividendPath), dividend));
  });

  it('deve negar que usuário leia dividends de outro usuário', async () => {
    await seed(dividendPath, dividend);
    const bob = testEnv.authenticatedContext('bob');

    await assertFails(getDoc(doc(bob.firestore(), dividendPath)));
  });

  it('deve negar que usuário escreva em dividends de outro usuário', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await assertFails(setDoc(doc(bob.firestore(), dividendPath), dividend));
  });

  it('deve negar acesso não autenticado a dividends', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), dividendPath)));
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
// patrimonySnapshots
// ---------------------------------------------------------------------------

describe('Firestore rules – patrimonySnapshots', () => {
  it('deve negar que o proprietário leia os próprios snapshots', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(
        doc(context.firestore(), 'users/alice/patrimonySnapshots/2026-08-27'),
        { total: 100 },
      ),
    );

    await assertFails(
      getDoc(
        doc(alice.firestore(), 'users/alice/patrimonySnapshots/2026-08-27'),
      ),
    );
  });

  it('deve negar que outro usuário leia snapshots', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(
        doc(context.firestore(), 'users/alice/patrimonySnapshots/2026-08-27'),
        { total: 100 },
      ),
    );

    await assertFails(
      getDoc(doc(bob.firestore(), 'users/alice/patrimonySnapshots/2026-08-27')),
    );
  });

  it('deve negar que o proprietário escreva snapshots', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(
        doc(alice.firestore(), 'users/alice/patrimonySnapshots/2026-08-27'),
        { total: 100 },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// alerts (issue #118)
// ---------------------------------------------------------------------------

describe('Firestore rules – alerts', () => {
  const alertPath = 'users/alice/alerts/fridge-1_HGLG11';

  it('deve negar que o proprietário leia os próprios alertas', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await seed(alertPath, { ticker: 'HGLG11', status: 'open' });

    await assertFails(getDoc(doc(alice.firestore(), alertPath)));
  });

  it('deve negar que outro usuário leia os alertas', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await seed(alertPath, { ticker: 'HGLG11', status: 'open' });

    await assertFails(getDoc(doc(bob.firestore(), alertPath)));
  });

  it('deve negar que o proprietário escreva alertas', async () => {
    const alice = testEnv.authenticatedContext('alice');

    await assertFails(
      setDoc(doc(alice.firestore(), alertPath), {
        ticker: 'HGLG11',
        status: 'open',
      }),
    );
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

// ---------------------------------------------------------------------------
// billing (assinatura)
// ---------------------------------------------------------------------------

describe('Firestore rules – billing', () => {
  const path = 'users/alice/billing/subscription';

  it('deve negar que o proprietário leia a própria assinatura', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), path), { status: 'active' }),
    );

    await assertFails(getDoc(doc(alice.firestore(), path)));
  });

  it('deve negar que outro usuário leia a assinatura', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), path), { status: 'active' }),
    );

    await assertFails(getDoc(doc(bob.firestore(), path)));
  });

  it('deve negar que o proprietário escreva sua assinatura', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), path), { status: 'active' }),
    );
  });

  it('deve negar acesso não autenticado à assinatura', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), path)));
  });
});

// ---------------------------------------------------------------------------
// billingEvents (idempotência de webhooks — somente Admin SDK)
// ---------------------------------------------------------------------------

describe('Firestore rules – billingEvents', () => {
  const path = 'billingEvents/evt_1';

  it('deve negar leitura para usuário autenticado', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), path), { type: 'invoice.paid' }),
    );

    await assertFails(getDoc(doc(alice.firestore(), path)));
  });

  it('deve negar escrita para usuário autenticado', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), path), { type: 'invoice.paid' }),
    );
  });

  it('deve negar acesso não autenticado', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauth.firestore(), path)));
  });
});
