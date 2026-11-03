import { chunks } from './chunks';

describe('chunks', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no chunks for an empty array', () => {
    expect(chunks([], 3)).toEqual([]);
  });

  it('rejects a non-positive size', () => {
    expect(() => chunks([1], 0)).toThrow('Chunk size must be a positive integer');
  });
});
