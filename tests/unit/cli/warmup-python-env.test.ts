import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetConfig } from '../../../src/config.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    chmodSync: vi.fn(),
  };
});

vi.mock('../../../src/cli/tui/run-command.js', () => ({
  runCommand: vi.fn(),
}));

vi.mock('../../../src/searxng/bootstrap.js', () => ({
  checkPythonAvailable: () => true,
  getBootstrapState: () => ({ status: 'ready', searxngPath: '/tmp/wigolo/searxng' }),
  bootstrapNativeSearxng: vi.fn(),
}));

vi.mock('../../../src/providers/rerank-provider.js', () => ({
  getRerankProvider: vi.fn(async () => ({
    modelId: 'Xenova/ms-marco-MiniLM-L-6-v2',
    rerank: vi.fn().mockResolvedValue([{ id: '0', score: 0.5 }]),
  })),
}));

const fastembedWarmup = vi.fn().mockResolvedValue(undefined);
const fastembedEmbed = vi.fn().mockResolvedValue([new Float32Array(384).fill(0.1)]);
vi.mock('../../../src/embedding/fastembed-provider.js', () => {
  const FastembedEmbedProvider = vi.fn(function (this: Record<string, unknown>) {
    this.modelId = 'BGE-small-en-v1.5';
    this.dim = 384;
    this.warmup = fastembedWarmup;
    this.embed = fastembedEmbed;
  });
  return { FastembedEmbedProvider };
});

import { existsSync } from 'node:fs';
import { runCommand } from '../../../src/cli/tui/run-command.js';
import { runWarmup } from '../../../src/cli/warmup.js';

const ok = { code: 0, stdout: '', stderr: '', timedOut: false };
const VENV_PYTHON = '/tmp/wigolo/searxng/venv/bin/python';

const pipCallFor = (needle: string) =>
  vi.mocked(runCommand).mock.calls.find((c) => (c[1] as string[]).some((a) => String(a).includes(needle)));

describe('warmup uses venv python', () => {
  beforeEach(() => {
    resetConfig();
    vi.clearAllMocks();
    process.env.WIGOLO_DATA_DIR = '/tmp/wigolo';
    vi.mocked(runCommand).mockResolvedValue(ok);
  });
  afterEach(() => {
    resetConfig();
    delete process.env.WIGOLO_DATA_DIR;
  });

  it('--reranker does not pip-install any Python packages (cross-encoder is in-process)', async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p) === VENV_PYTHON);

    await runWarmup(['--reranker']);

    expect(pipCallFor('tokenizers')).toBeUndefined();
    expect(pipCallFor('onnxruntime')).toBeUndefined();
    expect(pipCallFor('flashrank')).toBeUndefined();
  });

  it('warms up the fastembed embedding model when --embeddings is passed', async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p) === VENV_PYTHON);

    await runWarmup(['--embeddings']);

    // fastembed is native; there should be no pip call for sentence-transformers.
    expect(pipCallFor('sentence-transformers')).toBeUndefined();
    expect(fastembedWarmup).toHaveBeenCalled();
    expect(fastembedEmbed).toHaveBeenCalled();
  });

});

