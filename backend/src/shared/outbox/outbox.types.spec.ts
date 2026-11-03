import { outboxBackoffMs } from './outbox.types';

describe('outboxBackoffMs', () => {
  it('doubles the delay per attempt', () => {
    expect(outboxBackoffMs(1)).toBe(2_000);
    expect(outboxBackoffMs(2)).toBe(4_000);
    expect(outboxBackoffMs(5)).toBe(32_000);
  });

  it('caps the delay at five minutes', () => {
    expect(outboxBackoffMs(30)).toBe(300_000);
  });
});
