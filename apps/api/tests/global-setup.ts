import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * A single in-memory MongoDB instance is booted once for the whole test run and
 * shared by every suite. Spawning one mongod per file (the previous default)
 * repeatedly timed out on slower/Windows hosts, so the URI is published to a
 * temp file that each worker reads back.
 */
const URI_FILE = join(tmpdir(), 'rentease-test-mongo-uri.txt');

// mongod itself readies in ~1s, but on some Windows hosts MongoMemoryServer
// occasionally never observes its "waiting for connections" line and aborts at
// the launch timeout. A bounded retry keeps the suite reliable without masking
// genuine failures.
const LAUNCH_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

let server: MongoMemoryServer | undefined;

export async function setup(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      server = await MongoMemoryServer.create({
        instance: { launchTimeout: LAUNCH_TIMEOUT_MS, args: ['--wiredTigerCacheSizeGB', '0.25'] },
      });
      writeFileSync(URI_FILE, server.getUri(), 'utf8');
      return;
    } catch (error) {
      lastError = error;
      await server?.stop().catch(() => undefined);
      server = undefined;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to start the in-memory MongoDB instance');
}

export async function teardown(): Promise<void> {
  await server?.stop();
  rmSync(URI_FILE, { force: true });
}

export function getTestMongoUri(): string {
  return readFileSync(URI_FILE, 'utf8').trim();
}
