import { describe, it, expect } from 'vitest';
import { MODELS, resolveModelId, getModel } from '../../../../src/search/reranker/models.js';

describe('reranker models manifest', () => {
  it('contains bge-reranker-v2-m3 as default', () => {
    expect(MODELS['bge-reranker-v2-m3']).toBeDefined();
  });
  it('contains ms-marco-MiniLM-L-12-v2 as fallback', () => {
    expect(MODELS['ms-marco-MiniLM-L-12-v2']).toBeDefined();
  });
  it('every model entry has 64-char hex SHA-256 for model + tokenizer + config', () => {
    for (const [id, m] of Object.entries(MODELS)) {
      expect(m.modelSha256, `${id} model sha`).toMatch(/^[a-f0-9]{64}$/);
      expect(m.tokenizerSha256, `${id} tokenizer sha`).toMatch(/^[a-f0-9]{64}$/);
      expect(m.configSha256, `${id} config sha`).toBeDefined();
      expect(m.configSha256, `${id} config sha`).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it('every model entry has https URLs for model, tokenizer, and config', () => {
    for (const [id, m] of Object.entries(MODELS)) {
      expect(m.modelUrl, `${id} model url`).toMatch(/^https:\/\//);
      expect(m.tokenizerUrl, `${id} tokenizer url`).toMatch(/^https:\/\//);
      expect(m.configUrl, `${id} config url`).toBeDefined();
      expect(m.configUrl, `${id} config url`).toMatch(/^https:\/\//);
    }
  });
  it('every model entry has positive integer approxBytes', () => {
    for (const [id, m] of Object.entries(MODELS)) {
      expect(Number.isInteger(m.approxBytes), `${id} approxBytes integer`).toBe(true);
      expect(m.approxBytes, `${id} approxBytes positive`).toBeGreaterThan(0);
    }
  });
  it('resolveModelId resolves minilm-l12 alias', () => {
    expect(resolveModelId('minilm-l12')).toBe('ms-marco-MiniLM-L-12-v2');
  });
  it('resolveModelId returns canonical id unchanged', () => {
    expect(resolveModelId('bge-reranker-v2-m3')).toBe('bge-reranker-v2-m3');
  });
  it('getModel throws on unknown id', () => {
    expect(() => getModel('does-not-exist')).toThrow(/unknown reranker model/i);
  });
});
