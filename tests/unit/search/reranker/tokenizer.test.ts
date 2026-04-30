import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenizePair } from '../../../../src/search/reranker/tokenizer.js';

describe('tokenizePair', () => {
  const fakeTokenizer = {
    encode: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('returns input_ids / attention_mask / token_type_ids as BigInt64Arrays', () => {
    fakeTokenizer.encode.mockReturnValue({
      input_ids:      { data: new BigInt64Array([101n, 1n, 102n, 2n, 102n]), dims: [1, 5] },
      attention_mask: { data: new BigInt64Array([  1n, 1n,   1n, 1n,   1n]), dims: [1, 5] },
      token_type_ids: { data: new BigInt64Array([  0n, 0n,   0n, 1n,   1n]), dims: [1, 5] },
    });
    const out = tokenizePair(fakeTokenizer as any, 'query', 'doc', 512);
    expect(out.input_ids).toBeInstanceOf(BigInt64Array);
    expect(out.attention_mask).toBeInstanceOf(BigInt64Array);
    expect(out.token_type_ids).toBeInstanceOf(BigInt64Array);
    expect(out.length).toBe(5);
  });

  it('honors max_length truncation', () => {
    fakeTokenizer.encode.mockReturnValue({
      input_ids:      { data: new BigInt64Array(128), dims: [1, 128] },
      attention_mask: { data: new BigInt64Array(128), dims: [1, 128] },
      token_type_ids: { data: new BigInt64Array(128), dims: [1, 128] },
    });
    tokenizePair(fakeTokenizer as any, 'q', 'd', 128);
    expect(fakeTokenizer.encode).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({ text_pair: 'd', max_length: 128, truncation: true }),
    );
  });

  it('falls back to zero-filled token_type_ids when missing', () => {
    fakeTokenizer.encode.mockReturnValue({
      input_ids:      { data: new BigInt64Array([101n, 1n, 102n]), dims: [1, 3] },
      attention_mask: { data: new BigInt64Array([1n, 1n, 1n]),     dims: [1, 3] },
    });
    const out = tokenizePair(fakeTokenizer as any, 'q', 'd', 512);
    expect(out.token_type_ids).toBeInstanceOf(BigInt64Array);
    expect(out.token_type_ids.length).toBe(3);
    expect(Array.from(out.token_type_ids)).toEqual([0n, 0n, 0n]);
  });
});
