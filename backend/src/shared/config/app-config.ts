export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  databaseUrl: string;
  meili: { url: string; apiKey: string; index: string };
  pimExportPath: string;
  /** Total catalogue size for `seed`: the export plus synthetic products; 0 = only the export. */
  seedCatalogSize: number;
  reviewRateLimit: { limit: number; ttlMs: number };
  outbox: { pollMs: number; relayEnabled: boolean };
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

function integer(env: Env, key: string, fallback: number, min?: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Environment variable ${key} must be an integer`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`Environment variable ${key} must be at least ${min}`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    port: integer(env, 'PORT', 3000),
    databaseUrl: required(env, 'DATABASE_URL'),
    meili: {
      url: env.MEILI_URL ?? 'http://localhost:7700',
      apiKey: env.MEILI_MASTER_KEY ?? '',
      index: env.MEILI_INDEX ?? 'products',
    },
    pimExportPath: env.PIM_EXPORT_PATH ?? '../data/products.csv',
    seedCatalogSize: integer(env, 'SEED_CATALOG_SIZE', 0, 0),
    reviewRateLimit: {
      limit: integer(env, 'REVIEW_RATE_LIMIT', 20),
      ttlMs: integer(env, 'REVIEW_RATE_TTL_MS', 600_000),
    },
    outbox: {
      pollMs: integer(env, 'OUTBOX_POLL_MS', 1000),
      relayEnabled: env.OUTBOX_RELAY_ENABLED !== 'false',
    },
  };
}
