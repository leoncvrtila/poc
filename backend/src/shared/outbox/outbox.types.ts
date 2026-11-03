export interface OutboxMessage<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

export type OutboxHandler = (payload: unknown) => Promise<void>;

/**
 * After this many failed attempts an event stays in the table with `last_error` as a dead letter:
 * `processed_at IS NULL AND attempts >= MAX_OUTBOX_ATTEMPTS`. With the 5-minute backoff cap, 20 attempts cover
 * several hours of downtime. After a long search outage, run the `search:reindex` command to catch up.
 */
export const MAX_OUTBOX_ATTEMPTS = 20;

/** Events claimed per batch. */
export const OUTBOX_BATCH_SIZE = 10;

/** A handler that runs longer than this counts as failed (and is retried with backoff). */
export const OUTBOX_HANDLER_TIMEOUT_MS = 30_000;

/**
 * How long a claimed event stays invisible to other relays. Invariant: lease > batch size x handler timeout
 * (10 x 30 s = 300 s < 600 s), so a live batch never loses its claim to another instance.
 */
export const OUTBOX_LEASE_SECONDS = 600;

export function outboxBackoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, 5 * 60_000);
}
