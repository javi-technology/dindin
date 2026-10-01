import { randomUUID } from 'crypto';
import { initializeApp, deleteApp, App } from 'firebase-admin/app';
import { getFirestore, CollectionReference } from 'firebase-admin/firestore';

import {
  DUPLICATE_WINDOW_MS,
  addUnlessRecentDuplicate,
} from '../../src/shared/recent-duplicate';
import { HttpError } from '../../src/shared/http-error';

// ---------------------------------------------------------------------------
// Recusa de criação idêntica em sequência (issue #497)
//
// Tocar de novo quando a resposta demora é o comportamento normal do usuário,
// e o resultado seria posição duplicada: quantidade dobrada, erro de dado
// financeiro. A proteção do cliente não basta (um app antigo, um retry de
// rede, um segundo dispositivo), então a API também recusa.
//
// Roda contra o emulador do Firestore, e não contra um dublê, porque o que
// importa é a concorrência: dois envios simultâneos precisam resultar em um
// único documento, e só uma transação de verdade prova isso.
// ---------------------------------------------------------------------------

describe('addUnlessRecentDuplicate', () => {
  let app: App;
  let collection: CollectionReference;

  const agora = new Date('2026-10-01T15:00:00.000Z');
  const iso = (deslocamentoMs = 0): string =>
    new Date(agora.getTime() + deslocamentoMs).toISOString();

  const posicao = (sobrescrever: Record<string, unknown> = {}) => ({
    ticker: 'HGLG11',
    quantity: 10,
    averagePrice: 110.5,
    createdAt: iso(),
    updatedAt: iso(),
    ...sobrescrever,
  });

  beforeAll(() => {
    app = initializeApp(
      { projectId: 'dindin-test' },
      `recent-dup-${randomUUID()}`,
    );
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(() => {
    // Uma coleção por teste: nenhum depende do que o anterior gravou.
    collection = getFirestore(app).collection(`teste-${randomUUID()}`);
  });

  const total = async (): Promise<number> => (await collection.get()).size;

  it('deve gravar o documento e devolver o id', async () => {
    const id = await addUnlessRecentDuplicate(collection, posicao());

    const gravado = await collection.doc(id).get();
    expect(gravado.exists).toBe(true);
    expect(gravado.data()).toEqual(posicao());
  });

  it('deve recusar com 409 o envio idêntico dentro da janela', async () => {
    await addUnlessRecentDuplicate(collection, posicao());

    const segundo = addUnlessRecentDuplicate(
      collection,
      posicao({ createdAt: iso(2_000), updatedAt: iso(2_000) }),
    );

    await expect(segundo).rejects.toBeInstanceOf(HttpError);
    await expect(segundo).rejects.toMatchObject({ statusCode: 409 });
    expect(await total()).toBe(1);
  });

  it('deve explicar em português o que aconteceu', async () => {
    await addUnlessRecentDuplicate(collection, posicao());

    await expect(
      addUnlessRecentDuplicate(collection, posicao({ createdAt: iso(1_000) })),
    ).rejects.toThrow(/idêntico.*instantes/i);
  });

  it('deve aceitar o envio quando algum valor é diferente', async () => {
    await addUnlessRecentDuplicate(collection, posicao());

    await addUnlessRecentDuplicate(
      collection,
      posicao({ quantity: 11, createdAt: iso(1_000) }),
    );

    expect(await total()).toBe(2);
  });

  it('deve aceitar o envio de outro ticker com os mesmos valores', async () => {
    await addUnlessRecentDuplicate(collection, posicao());

    await addUnlessRecentDuplicate(
      collection,
      posicao({ ticker: 'KNRI11', createdAt: iso(1_000) }),
    );

    expect(await total()).toBe(2);
  });

  it('deve aceitar o envio idêntico depois da janela', async () => {
    await addUnlessRecentDuplicate(collection, posicao());

    await addUnlessRecentDuplicate(
      collection,
      posicao({ createdAt: iso(DUPLICATE_WINDOW_MS + 1_000) }),
    );

    expect(await total()).toBe(2);
  });

  it('deve tratar campo opcional ausente e nulo como o mesmo valor', async () => {
    await addUnlessRecentDuplicate(collection, posicao({ targetPrice: null }));

    await expect(
      addUnlessRecentDuplicate(collection, posicao({ createdAt: iso(500) })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deve gravar um único documento quando dois envios idênticos chegam juntos', async () => {
    const resultados = await Promise.allSettled([
      addUnlessRecentDuplicate(collection, posicao()),
      addUnlessRecentDuplicate(collection, posicao()),
    ]);

    const gravados = resultados.filter((r) => r.status === 'fulfilled');
    const recusados = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(gravados).toHaveLength(1);
    expect(recusados).toHaveLength(1);
    expect(recusados[0].reason).toMatchObject({ statusCode: 409 });
    expect(await total()).toBe(1);
  });
});
