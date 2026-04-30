import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('../../../../src/search/reranker/models.js', () => ({
  getModel: vi.fn(),
  resolveModelId: (s: string) => s,
}));
vi.mock('../../../../src/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { downloadModelAssets, _setFetchImpl } from '../../../../src/search/reranker/download.js';
import { getModel } from '../../../../src/search/reranker/models.js';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function makeReader(bytes: Buffer) {
  let sent = false;
  return {
    read: async () => sent ? { done: true } : (sent = true, { done: false, value: bytes }),
  };
}

describe('downloadModelAssets', () => {
  let dir: string;
  const modelBytes = Buffer.from('FAKE-ONNX-BYTES');
  const tokBytes = Buffer.from('{"version":1}');
  const cfgBytes = Buffer.from('{"model_type":"bert"}');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wigolo-rerank-'));
    vi.mocked(getModel).mockReturnValue({
      id: 'bge-reranker-v2-m3',
      modelUrl: 'https://test/model.onnx',
      modelSha256: sha(modelBytes),
      tokenizerUrl: 'https://test/tok.json',
      tokenizerSha256: sha(tokBytes),
      configUrl: 'https://test/cfg.json',
      configSha256: sha(cfgBytes),
      approxBytes: modelBytes.length,
    });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('downloads, verifies SHA-256, and caches', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true, status: 200,
      headers: new Map([['content-length', '15']]),
      body: { getReader: () => makeReader(url === 'https://test/model.onnx' ? modelBytes : url.endsWith('tok.json') ? tokBytes : cfgBytes) },
    }));
    _setFetchImpl(fetchImpl as any);
    const out = await downloadModelAssets('bge-reranker-v2-m3', dir);
    expect(existsSync(out.modelPath)).toBe(true);
    expect(existsSync(out.tokenizerPath)).toBe(true);
    expect(existsSync(out.configPath)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('skips download when cached + valid', async () => {
    const modelDir = join(dir, 'models', 'bge-reranker-v2-m3');
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, 'model_quantized.onnx'), modelBytes);
    writeFileSync(join(modelDir, 'tokenizer.json'), tokBytes);
    writeFileSync(join(modelDir, 'tokenizer_config.json'), cfgBytes);
    const fetchImpl = vi.fn();
    _setFetchImpl(fetchImpl as any);
    await downloadModelAssets('bge-reranker-v2-m3', dir);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('re-downloads when cached file fails SHA-256', async () => {
    const modelDir = join(dir, 'models', 'bge-reranker-v2-m3');
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, 'model_quantized.onnx'), Buffer.from('CORRUPT'));
    writeFileSync(join(modelDir, 'tokenizer.json'), tokBytes);
    writeFileSync(join(modelDir, 'tokenizer_config.json'), cfgBytes);
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200,
      headers: new Map([['content-length', '15']]),
      body: { getReader: () => makeReader(modelBytes) },
    }));
    _setFetchImpl(fetchImpl as any);
    await downloadModelAssets('bge-reranker-v2-m3', dir);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(modelDir, 'model_quantized.onnx')).equals(modelBytes)).toBe(true);
  });

  it('throws when remote SHA-256 mismatches manifest', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200,
      headers: new Map([['content-length', '8']]),
      body: { getReader: () => makeReader(Buffer.from('TAMPERED')) },
    }));
    _setFetchImpl(fetchImpl as any);
    await expect(downloadModelAssets('bge-reranker-v2-m3', dir)).rejects.toThrow(/SHA-256 mismatch/);
  });
});
