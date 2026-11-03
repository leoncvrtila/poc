import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { Readable } from 'node:stream';
import { SearchUnavailableError } from '../src/modules/search/domain/ports';
import type { ProductDocument } from '../src/modules/search/domain/product-document';
import type { ProductSearchQuery } from '../src/modules/search/domain/search-query';
import { MeiliClient, MeiliError } from '../src/modules/search/infrastructure/meili/meili-client';
import { MeiliProductIndex } from '../src/modules/search/infrastructure/meili/meili-product-index';
import { MeiliProductSearch } from '../src/modules/search/infrastructure/meili/meili-product-search';

const MEILI_URL = process.env.MEILI_URL!;
const MASTER_KEY = process.env.MEILI_MASTER_KEY!;
const UNREACHABLE_URL = 'http://127.0.0.1:1';

const searchQuery: ProductSearchQuery = {
  q: '',
  sort: 'name',
  page: 1,
  pageSize: 20,
  filters: { function: [], applicationArea: [], region: [], certification: [], status: ['ACTIVE'] },
};

const document: ProductDocument = {
  sku: 'F-1',
  displayName: 'Failure Probe',
  name: 'Failure Probe',
  chemicalName: 'Generic',
  function: 'Solvent',
  applicationArea: 'Coatings',
  region: 'Global',
  certifications: [],
  status: 'ACTIVE',
  description: 'Test product',
  reviewCount: 0,
};

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

/** The index may not exist if the run failed early; any other failure must surface. */
async function dropIndexIfExists(client: MeiliClient, uid: string): Promise<void> {
  try {
    await client.runTask('DELETE', `/indexes/${uid}`);
  } catch (error) {
    if ((error as { code?: string }).code !== 'index_not_found') {
      throw error;
    }
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolveListening) =>
    server.listen(0, '127.0.0.1', () => resolveListening(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)),
  );
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClosed) => server.close(() => resolveClosed()));
}

describe('MeiliClient against a real Meilisearch (failure behaviour)', () => {
  it('reports the Meilisearch error code and status for a wrong API key', async () => {
    const client = new MeiliClient(MEILI_URL, 'definitely-not-the-key');

    const error = await caught(client.request('GET', '/indexes'));

    expect(error).toBeInstanceOf(MeiliError);
    // Meilisearch answers 403 for a wrong key (401 only when the key is missing).
    expect(error).toMatchObject({ status: 403, code: 'invalid_api_key' });
  });

  it('reports an unreachable host', async () => {
    const client = new MeiliClient(UNREACHABLE_URL, MASTER_KEY);

    const error = await caught(client.request('GET', '/health'));

    expect(error).toMatchObject({ message: expect.stringContaining('unreachable'), status: null, code: null });
  });

  it('reports a request that exceeds the timeout', async () => {
    // A server that accepts the connection but never answers makes the timeout deterministic.
    const sockets = new Set<Socket>();
    const silent = createServer(() => undefined);
    silent.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    try {
      const client = new MeiliClient(await listen(silent), MASTER_KEY, undefined, 100, 50);

      const error = await caught(client.request('GET', '/health'));

      expect(error).toMatchObject({ message: expect.stringContaining('timed out after 50 ms'), status: null });
    } finally {
      sockets.forEach((socket) => socket.destroy());
      await close(silent);
    }
  });

  it('rejects runTask for an endpoint that does not return a task', async () => {
    const client = new MeiliClient(MEILI_URL, MASTER_KEY);

    const error = await caught(client.runTask('GET', '/health'));

    expect(error).toMatchObject({ message: 'Expected a task from GET /health' });
  });

  it('surfaces the error of a failed task', async () => {
    const client = new MeiliClient(MEILI_URL, MASTER_KEY);
    const uid = `products_fail_dup_${Date.now()}`;
    await client.runTask('POST', '/indexes', { uid, primaryKey: 'sku' });

    try {
      const error = await caught(client.runTask('POST', '/indexes', { uid, primaryKey: 'sku' }));

      expect(error).toMatchObject({ code: 'index_already_exists' });
    } finally {
      await client.runTask('DELETE', `/indexes/${uid}`);
    }
  });
});

describe('MeiliClient against a misbehaving server', () => {
  let server: Server;
  let handler: RequestListener;
  let client: MeiliClient;

  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    client = new MeiliClient(`${await listen(server)}/`, 'key', undefined, 1);
  });

  afterAll(async () => {
    await close(server);
  });

  function respond(status: number, body: string): void {
    handler = (_req, res) => {
      res.statusCode = status;
      res.end(body);
    };
  }

  it('reports the status when an error response is not JSON', async () => {
    respond(502, '<html>Bad Gateway</html>');

    expect(await caught(client.request('GET', '/x'))).toMatchObject({
      message: 'Meilisearch responded with 502',
      status: 502,
      code: null,
    });
  });

  it('rejects a successful response that is not JSON', async () => {
    respond(200, 'OK');

    expect(await caught(client.request('GET', '/x'))).toMatchObject({
      message: 'Meilisearch returned an unparseable response for GET /x',
      status: 200,
    });
  });

  it('falls back to the status when an error body has no message or code', async () => {
    respond(500, '{"unexpected":true}');

    expect(await caught(client.request('GET', '/x'))).toMatchObject({
      message: 'Meilisearch responded with 500',
      status: 500,
      code: null,
    });
  });

  it('treats an empty successful response as no data', async () => {
    respond(204, '');

    expect(await caught(client.runTask('POST', '/x'))).toMatchObject({ message: 'Expected a task from POST /x' });
  });

  it('reports a canceled task without an error message', async () => {
    respond(200, '{"uid":7,"status":"canceled"}');

    expect(await caught(client.waitForTask(7))).toMatchObject({ message: 'Task 7 canceled', code: null });
  });

  it('gives up waiting for a task that never finishes', async () => {
    respond(200, '{"uid":8,"status":"processing"}');

    expect(await caught(client.waitForTask(8, -1))).toMatchObject({
      message: 'Timed out waiting for Meilisearch task 8',
    });
  });

  it('polls until a task succeeds', async () => {
    let calls = 0;
    handler = (_req, res) => {
      calls += 1;
      res.end(JSON.stringify({ uid: 9, status: calls < 3 ? 'enqueued' : 'succeeded' }));
    };

    expect(await client.waitForTask(9)).toMatchObject({ status: 'succeeded' });
    expect(calls).toBe(3);
  });
});

describe('Meilisearch adapters when Meilisearch fails', () => {
  const suffix = Date.now();

  it('maps a wrong API key to SearchUnavailableError', async () => {
    const engine = new MeiliProductSearch(new MeiliClient(MEILI_URL, 'wrong'), `products_fail_${suffix}`);

    const error = await caught(engine.search(searchQuery));

    expect(error).toBeInstanceOf(SearchUnavailableError);
    expect((error as Error).cause).toMatchObject({ code: 'invalid_api_key' });
  });

  it('maps an unreachable host to SearchUnavailableError', async () => {
    const engine = new MeiliProductSearch(new MeiliClient(UNREACHABLE_URL, MASTER_KEY), `products_fail_${suffix}`);

    const error = await caught(engine.search(searchQuery));

    expect(error).toBeInstanceOf(SearchUnavailableError);
    expect((error as Error).message).toContain('unreachable');
  });

  it('maps a response without an error code to SearchUnavailableError', async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 503;
      res.end('down');
    });
    try {
      const engine = new MeiliProductSearch(
        new MeiliClient(await listen(server), MASTER_KEY),
        `products_fail_${suffix}`,
      );

      const error = await caught(engine.search(searchQuery));

      expect(error).toBeInstanceOf(SearchUnavailableError);
      expect((error as Error).cause).toMatchObject({ status: 503, code: null });
    } finally {
      await close(server);
    }
  });

  it('does not memoize a failed index preparation', async () => {
    let failNext = true;
    const requests: string[] = [];
    const flaky = (input: string, init: RequestInit): Promise<Response> => {
      requests.push(`${init.method} ${new URL(input).pathname}`);
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('connection reset'));
      }
      const isTaskLookup = input.includes('/tasks/');
      return Promise.resolve(
        new Response(JSON.stringify(isTaskLookup ? { uid: 1, status: 'succeeded' } : { taskUid: 1 })),
      );
    };
    const index = new MeiliProductIndex(new MeiliClient('http://meili.invalid', 'key', flaky, 1), 'products_flaky');

    expect(await caught(index.ensureReady())).toMatchObject({ message: expect.stringContaining('connection reset') });
    // The retry attempts the work again (and succeeds) instead of replaying the cached rejection.
    await index.ensureReady();
    expect(requests.filter((request) => request === 'POST /indexes')).toHaveLength(2);

    await index.ensureReady();
    expect(requests.filter((request) => request === 'POST /indexes')).toHaveLength(2);
  });

  it('re-prepares the index after a write failed because the index vanished', async () => {
    const uid = `products_fail_wipe_${suffix}`;
    const client = new MeiliClient(MEILI_URL, MASTER_KEY);
    const index = new MeiliProductIndex(client, uid);
    await index.ensureReady();
    await client.runTask('DELETE', `/indexes/${uid}`);

    try {
      expect(await caught(index.remove(['F-1']))).toMatchObject({ code: 'index_not_found' });

      await index.upsert([document]);

      const engine = new MeiliProductSearch(client, uid);
      expect((await engine.search(searchQuery)).items.map((item) => item.sku)).toEqual(['F-1']);
    } finally {
      await client.runTask('DELETE', `/indexes/${uid}`);
    }
  });

  it('does not swallow unexpected errors while cleaning up the staging index during a rebuild', async () => {
    const uid = `products_fail_perm_${suffix}`;
    const master = new MeiliClient(MEILI_URL, MASTER_KEY);
    const created = await master.request<{ key: string; uid: string }>('POST', '/keys', {
      description: 'test key without indexes.delete',
      actions: ['indexes.create', 'indexes.get', 'settings.*', 'documents.*', 'search', 'tasks.get', 'indexes.swap'],
      indexes: ['products_fail_perm_*'],
      expiresAt: null,
    });
    try {
      const index = new MeiliProductIndex(new MeiliClient(MEILI_URL, created.key), uid);
      const batches = Readable.from([[document]]) as AsyncIterable<ProductDocument[]>;

      expect(await caught(index.rebuild(batches))).toMatchObject({ status: 403 });
    } finally {
      try {
        await dropIndexIfExists(master, uid);
        await dropIndexIfExists(master, `${uid}_rebuild`);
      } finally {
        await master.request('DELETE', `/keys/${created.uid}`);
      }
    }
  });
});
