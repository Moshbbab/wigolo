/**
 * Embedding throughput perf bench (gated on RUN_FASTEMBED=1).
 *
 * Performance gates:
 *   single 512-token  P50 ≤ 100ms
 *   batch 32 short    P50 ≤ 200ms
 *
 * Requires huggingface.co network access on first run to download the ONNX
 * model (~24 MB). Subsequent runs reuse ~/.wigolo/fastembed cache.
 *
 * Run on dev host:
 *   RUN_FASTEMBED=1 npm run test:perf -- tests/perf/embedding.bench.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FastembedEmbedProvider } from '../../src/embedding/fastembed-provider.js';

const GATED = !process.env.RUN_FASTEMBED;

const SHORT = 'TypeScript is great';
// ~512 tokens
const LONG = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(60);

function p50(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.5)];
}

async function time(fn: () => Promise<void>): Promise<number> {
  const t0 = Date.now();
  await fn();
  return Date.now() - t0;
}

describe.skipIf(GATED)('embedding throughput (gated on RUN_FASTEMBED=1)', () => {
  let provider: FastembedEmbedProvider;

  beforeAll(async () => {
    provider = new FastembedEmbedProvider();
    await provider.warmup();
  }, 120_000);

  it('single short p50 sanity (warmup check)', async () => {
    const ms = await time(() => provider.embed([SHORT]));
    process.stderr.write(`[perf] single short warmup: ${ms}ms\n`);
    // No hard gate on warmup run — just confirm it returns
    expect(ms).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('single short p50 ≤ 100ms', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      samples.push(await time(() => provider.embed([SHORT])));
    }
    const result = p50(samples);
    process.stderr.write(`[perf] single short p50=${result}ms  samples=[${samples.join(',')}]\n`);
    expect(result, `single short P50 ${result}ms exceeded 100ms gate`).toBeLessThanOrEqual(100);
  }, 60_000);

  it('batch 32 short p50 ≤ 200ms', async () => {
    const batch = Array(32).fill(SHORT);
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push(await time(() => provider.embed(batch)));
    }
    const result = p50(samples);
    process.stderr.write(`[perf] batch-32 short p50=${result}ms  samples=[${samples.join(',')}]\n`);
    expect(result, `batch-32 short P50 ${result}ms exceeded 200ms gate`).toBeLessThanOrEqual(200);
  }, 60_000);

  it('single 512-token p50 ≤ 100ms', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      samples.push(await time(() => provider.embed([LONG])));
    }
    const result = p50(samples);
    process.stderr.write(`[perf] single 512-token p50=${result}ms  samples=[${samples.join(',')}]\n`);
    expect(result, `single 512-token P50 ${result}ms exceeded 100ms gate`).toBeLessThanOrEqual(100);
  }, 60_000);
});
