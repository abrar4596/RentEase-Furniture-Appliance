import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A single in-memory MongoDB is started once (see tests/global-setup.ts) and
    // shared by all suites. Because they share one database, suites run
    // sequentially and each one clears the collections it uses in beforeEach.
    // The raised timeouts keep slow/loaded hosts from failing on mongod startup.
    globalSetup: ['./tests/global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
