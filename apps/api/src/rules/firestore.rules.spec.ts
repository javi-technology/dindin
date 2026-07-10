import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

const rulesPath = path.resolve(__dirname, "../../../../firestore.rules");

let testEnv: RulesTestEnvironment;

describe("Firestore rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "dindin-test",
      firestore: {
        rules: fs.readFileSync(rulesPath, "utf8"),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it("deve permitir que usuário autenticado leia seus próprios dados", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const ref = doc(alice.firestore(), "users/alice/wallets/main");

    await assertSucceeds(setDoc(ref, { balance: 100 }));
    const snapshot = await assertSucceeds(getDoc(ref));

    expect(snapshot.exists()).toBe(true);
    expect(snapshot.data()?.balance).toBe(100);
  });

  it("deve negar que usuário autenticado leia dados de outro usuário", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const bob = testEnv.authenticatedContext("bob");
    const ref = doc(alice.firestore(), "users/alice/wallets/main");

    await assertSucceeds(setDoc(ref, { balance: 100 }));

    const bobRef = doc(bob.firestore(), "users/alice/wallets/main");
    await assertFails(getDoc(bobRef));
  });

  it("deve negar que usuário não autenticado leia dados", async () => {
    const unauthenticated = testEnv.unauthenticatedContext();
    const ref = doc(unauthenticated.firestore(), "users/alice/wallets/main");

    await assertFails(getDoc(ref));
  });

  it("deve permitir que usuário autenticado escreva apenas em seus próprios dados", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const ref = doc(alice.firestore(), "users/alice/wallets/main");

    await assertSucceeds(setDoc(ref, { balance: 100 }));
  });

  it("deve negar que usuário autenticado escreva em dados de outro usuário", async () => {
    const bob = testEnv.authenticatedContext("bob");
    const ref = doc(bob.firestore(), "users/alice/wallets/main");

    await assertFails(setDoc(ref, { balance: 100 }));
  });

  it("deve negar acesso a coleções fora do escopo users/{userId}", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const ref = doc(alice.firestore(), "public/config");

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { value: "x" }));
  });
});
