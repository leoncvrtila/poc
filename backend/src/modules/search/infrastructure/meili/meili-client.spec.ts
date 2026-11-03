import { MeiliClient, MeiliError } from './meili-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('MeiliClient', () => {
  it('sends JSON with the bearer key, asks for an uncompressed response and parses it', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, { status: 'available' }));
    const client = new MeiliClient('http://meili:7700', 'key', fetchFn);

    await expect(client.request('POST', '/multi-search', { queries: [] })).resolves.toEqual({ status: 'available' });
    expect(fetchFn).toHaveBeenCalledWith('http://meili:7700/multi-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity', Authorization: 'Bearer key' },
      body: JSON.stringify({ queries: [] }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest asymmetric matcher is typed any
      signal: expect.any(AbortSignal),
    });
  });

  it('maps API errors to MeiliError with code and status', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { message: 'Index `x` not found.', code: 'index_not_found' }));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    const error = await client.request('GET', '/indexes/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MeiliError);
    expect(error).toMatchObject({ message: 'Index `x` not found.', status: 404, code: 'index_not_found' });
  });

  it('uses a per-request timeout when given', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    await expect(client.request('POST', '/multi-search', {}, { timeoutMs: 2000 })).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest asymmetric matcher is typed any
      message: expect.stringContaining('after 2000 ms'),
    });
  });

  it('maps network failures to MeiliError without status', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    await expect(client.request('GET', '/health')).rejects.toMatchObject({
      status: null,
      message: 'Meilisearch unreachable: fetch failed',
    });
  });

  it('waits until an enqueued task succeeds', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { taskUid: 7 }))
      .mockResolvedValueOnce(jsonResponse(200, { uid: 7, status: 'processing' }))
      .mockResolvedValueOnce(jsonResponse(200, { uid: 7, status: 'succeeded' }));
    const client = new MeiliClient('http://meili:7700', '', fetchFn, 1);

    await expect(client.runTask('POST', '/indexes/products/documents', [])).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(fetchFn).toHaveBeenLastCalledWith('http://meili:7700/tasks/7', expect.objectContaining({ method: 'GET' }));
  });

  it('turns a failed task into a MeiliError carrying the task error code', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { taskUid: 8 }))
      .mockResolvedValueOnce(
        jsonResponse(200, { uid: 8, status: 'failed', error: { message: 'exists', code: 'index_already_exists' } }),
      );
    const client = new MeiliClient('http://meili:7700', '', fetchFn, 1);

    await expect(client.runTask('POST', '/indexes', { uid: 'products' })).rejects.toMatchObject({
      code: 'index_already_exists',
    });
  });

  it('maps a non-JSON error body to MeiliError with the status', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    const error = await client.request('GET', '/health').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MeiliError);
    expect(error).toMatchObject({ message: 'Meilisearch responded with 502', status: 502, code: null });
  });

  it('maps an unparseable success body to MeiliError', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response('not json', { status: 200 }));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    await expect(client.request('GET', '/health')).rejects.toBeInstanceOf(MeiliError);
  });

  it('returns undefined for an empty body', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    await expect(client.request('DELETE', '/indexes/x')).resolves.toBeUndefined();
  });

  it('throws when a task-producing call returns no taskUid', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' }));
    const client = new MeiliClient('http://meili:7700', '', fetchFn, 1);

    await expect(client.runTask('POST', '/indexes', {})).rejects.toMatchObject({
      message: 'Expected a task from POST /indexes',
      status: null,
    });
  });

  it('omits the Authorization header when the key is empty', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    await client.request('GET', '/health');

    const init = (fetchFn.mock.calls as [string, RequestInit][])[0][1];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' });
  });

  it('trims a trailing slash from the base URL', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = new MeiliClient('http://meili:7700/', '', fetchFn);

    await client.request('GET', '/health');

    expect(fetchFn).toHaveBeenCalledWith('http://meili:7700/health', expect.anything());
  });

  it.each(['TimeoutError', 'AbortError'])('maps a %s to a timed-out MeiliError', async (name) => {
    const fetchFn = jest.fn().mockRejectedValue(new DOMException('The operation timed out', name));
    const client = new MeiliClient('http://meili:7700', '', fetchFn, 1, 5);

    const error = await client.request('GET', '/health').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MeiliError);
    expect(error).toMatchObject({ status: null, code: null });
    expect((error as Error).message).toMatch(/^Meilisearch request timed out/);
  });

  it('passes an abort signal to fetch', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = new MeiliClient('http://meili:7700', '', fetchFn);

    await client.request('GET', '/health');

    expect((fetchFn.mock.calls as [string, RequestInit][])[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
