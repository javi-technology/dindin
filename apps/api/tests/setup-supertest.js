const mockServers = new WeakMap();
const mockOpenedServers = new Set();

afterAll(async () => {
  await Promise.all(
    [...mockOpenedServers].map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

jest.mock('supertest', () => {
  const actualSupertest = jest.requireActual('supertest');

  const persistentSupertest = (app) => {
    if (typeof app !== 'function') return actualSupertest(app);

    let server = mockServers.get(app);
    if (!server) {
      server = app.listen(0);
      mockServers.set(app, server);
      mockOpenedServers.add(server);
    }

    return actualSupertest(server);
  };

  Object.assign(persistentSupertest, actualSupertest);
  return persistentSupertest;
});
