import { createWriteStream, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { getModel, resolveModelId } from './models.js';
import { createLogger } from '../../logger.js';
import type { WarmupReporter } from '../../cli/tui/reporter.js';

const log = createLogger('reranker');

let fetchImpl: typeof fetch = globalThis.fetch;
export function _setFetchImpl(impl: typeof fetch): void {
  fetchImpl = impl;
}

const FILES = [
  { key: 'modelUrl', shaKey: 'modelSha256', filename: 'model_quantized.onnx', label: 'model' },
  { key: 'tokenizerUrl', shaKey: 'tokenizerSha256', filename: 'tokenizer.json', label: 'tokenizer' },
  { key: 'configUrl', shaKey: 'configSha256', filename: 'tokenizer_config.json', label: 'config' },
] as const;

export interface DownloadPaths {
  modelPath: string;
  tokenizerPath: string;
  configPath: string;
}

export async function downloadModelAssets(
  modelId: string,
  dataDir: string,
  reporter?: WarmupReporter,
): Promise<DownloadPaths> {
  const id = resolveModelId(modelId);
  const m = getModel(id) as unknown as Record<string, string | number>;
  const targetDir = join(dataDir, 'models', id);
  mkdirSync(targetDir, { recursive: true });

  for (const f of FILES) {
    const dest = join(targetDir, f.filename);
    const expectedSha = m[f.shaKey] as string;

    if (existsSync(dest)) {
      const actual = sha256Of(dest);
      if (actual === expectedSha) {
        log.debug('cached asset valid', { id, file: f.filename });
        continue;
      }
      log.warn('cached asset corrupt — re-downloading', { id, file: f.filename, expected: expectedSha, actual });
      unlinkSync(dest);
    }

    await downloadOne(m[f.key] as string, dest, expectedSha, reporter, f.label);
  }

  return {
    modelPath: join(targetDir, 'model_quantized.onnx'),
    tokenizerPath: join(targetDir, 'tokenizer.json'),
    configPath: join(targetDir, 'tokenizer_config.json'),
  };
}

async function downloadOne(
  url: string,
  dest: string,
  expectedSha: string,
  reporter: WarmupReporter | undefined,
  label: string,
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const resp = await fetchImpl(url);
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const headers = resp.headers as unknown as { get?: (k: string) => string | null };
  const totalRaw = headers.get?.('content-length') ?? '0';
  const total = Number(totalRaw);
  let downloaded = 0;
  const ws = createWriteStream(dest);
  const reader = (resp.body as unknown as { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } }).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      if (!ws.write(value)) await new Promise<void>((r) => ws.once('drain', r));
      downloaded += value.byteLength;
      if (total > 0 && reporter) reporter.progress('reranker', downloaded / total);
    }
  } finally {
    ws.end();
    await new Promise<void>((r) => ws.once('finish', () => r()));
  }
  const actual = sha256Of(dest);
  if (actual !== expectedSha) {
    unlinkSync(dest);
    throw new Error(`SHA-256 mismatch for ${label} at ${url}: expected ${expectedSha}, got ${actual}`);
  }
}

function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
