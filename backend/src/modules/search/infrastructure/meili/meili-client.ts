export interface MeiliTaskStatus {
  uid: number;
  status: 'enqueued' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  error?: { message: string; code: string } | null;
}

export class MeiliError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MeiliError';
  }
}

function isAbort(error: unknown): boolean {
  // DOMException is not always an `Error` instance across realms, so check the name only.
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Thin typed wrapper over the Meilisearch REST API.
 * The official SDK is ESM-only and cannot be loaded by this CommonJS/Jest backend; we use ~7 endpoints.
 */
export class MeiliClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
    private readonly pollIntervalMs = 100,
    private readonly requestTimeoutMs = 30_000,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async request<T>(method: string, path: string, body?: unknown, options: { timeoutMs?: number } = {}): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    let response: Response;
    let text: string;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          // fetch asks for gzip by default; Meilisearch then streams small compressed chunks that hit
          // Nagle + delayed ACK and add ~40 ms to most searches. Compression gains nothing on an internal network.
          'Accept-Encoding': 'identity',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      if (isAbort(error)) {
        throw new MeiliError(`Meilisearch request timed out after ${timeoutMs} ms: ${method} ${path}`, null, null);
      }
      throw new MeiliError(
        `Meilisearch unreachable: ${error instanceof Error ? error.message : String(error)}`,
        null,
        null,
      );
    }

    let data: Record<string, unknown> | undefined;
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        if (!response.ok) {
          throw new MeiliError(`Meilisearch responded with ${response.status}`, response.status, null);
        }
        throw new MeiliError(
          `Meilisearch returned an unparseable response for ${method} ${path}`,
          response.status,
          null,
        );
      }
    }
    if (!response.ok) {
      throw new MeiliError(
        typeof data?.message === 'string' ? data.message : `Meilisearch responded with ${response.status}`,
        response.status,
        typeof data?.code === 'string' ? data.code : null,
      );
    }
    return data as T;
  }

  async runTask(method: string, path: string, body?: unknown, timeoutMs = 120_000): Promise<MeiliTaskStatus> {
    const result = await this.request<{ taskUid?: unknown } | undefined>(method, path, body);
    const taskUid = result?.taskUid;
    if (typeof taskUid !== 'number') {
      throw new MeiliError(`Expected a task from ${method} ${path}`, null, null);
    }
    return this.waitForTask(taskUid, timeoutMs);
  }

  async waitForTask(taskUid: number, timeoutMs = 120_000): Promise<MeiliTaskStatus> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const task = await this.request<MeiliTaskStatus>('GET', `/tasks/${taskUid}`);
      if (task.status === 'succeeded') {
        return task;
      }
      if (task.status === 'failed' || task.status === 'canceled') {
        throw new MeiliError(task.error?.message ?? `Task ${taskUid} ${task.status}`, null, task.error?.code ?? null);
      }
      if (Date.now() > deadline) {
        throw new MeiliError(`Timed out waiting for Meilisearch task ${taskUid}`, null, null);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}
