#!/usr/bin/env node
/**
 * Per-tool P50/P95 latency bench. Sandbox-skippable.
 *
 * Run on dev host:
 *   RUN_PERF_BENCH=1 npx tsx benchmarks/perf/tool-latency.ts
 *
 * Output: benchmarks/perf/output/tool-latency.json
 *
 * Scope: measures the underlying primitives that dominate per-tool latency,
 * not the full MCP handler wiring. Picking primitives avoids fabricating
 * SmartRouter/engine lists and keeps the script deterministic-ish:
 *
 *   classifyIntent       — pure CPU, no network, regression check for routing
 *   runV1Search          — orchestrator + engines (network, dev host only)
 *   extractContent       — pure work on fixed HTML
 *   embed.embed([...])   — ONNX model inference (CPU-bound)
 *   rerank.rerank(...)   — cross-encoder inference (CPU-bound)
 *
 * crawl + research have their own scaffolds elsewhere and are intentionally
 * not measured here.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.RUN_PERF_BENCH) {
  process.stderr.write(
    '[bench:perf] Skipped. Set RUN_PERF_BENCH=1 to run (sandbox-skippable).\n',
  );
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'output');
const OUT_PATH = join(OUT_DIR, 'tool-latency.json');

const ITERATIONS = 5;
const WARM_RUNS = 2;

interface ToolMeasurement {
  tool: string;
  inputs: number;
  iterations: number;
  p50_ms: number;
  p95_ms: number;
  samples_ms: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function now(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

async function measure(
  tool: string,
  inputs: unknown[],
  run: (input: unknown) => Promise<unknown> | unknown,
): Promise<ToolMeasurement> {
  // Warm runs (discarded).
  for (let w = 0; w < WARM_RUNS; w++) {
    for (const input of inputs) {
      try {
        await run(input);
      } catch {
        // Errors during warmup are still informative — surface to stderr but
        // don't abort the bench; cold-path latency is what we want next.
      }
    }
  }

  const samples: number[] = [];
  for (let it = 0; it < ITERATIONS; it++) {
    for (const input of inputs) {
      const t0 = now();
      try {
        await run(input);
      } catch (err) {
        process.stderr.write(
          `[bench:perf] ${tool} sample errored: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
      samples.push(now() - t0);
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    tool,
    inputs: inputs.length,
    iterations: ITERATIONS,
    p50_ms: Number(percentile(sorted, 50).toFixed(2)),
    p95_ms: Number(percentile(sorted, 95).toFixed(2)),
    samples_ms: samples.map((s) => Number(s.toFixed(2))),
  };
}

const SEARCH_QUERIES = [
  'typescript generics tutorial',
  'sqlite fts5 vs vector search',
  'react server components when to use',
  'fastembed model comparison',
  'http/2 vs http/3 latency',
];

const EXTRACT_HTML = `<!doctype html><html><head><title>Sample</title></head>
<body><article><h1>Headline</h1><p>${'Lorem ipsum dolor sit amet. '.repeat(40)}</p>
<h2>Section</h2><p>${'Sed do eiusmod tempor incididunt. '.repeat(40)}</p></article></body></html>`;
const EXTRACT_INPUTS = SEARCH_QUERIES.map((_, i) => ({
  html: EXTRACT_HTML,
  url: `https://example.test/perf/${i}`,
}));

const EMBED_INPUTS = [
  ['short query'],
  ['medium length sentence with a few more tokens than the prior input'],
  ['one', 'two', 'three', 'four', 'five'],
  ['paragraph: ' + 'lorem ipsum '.repeat(30)],
  Array.from({ length: 16 }, (_, i) => `batch item ${i}`),
];

const RERANK_QUERY = 'how does fastembed compare to sentence-transformers';
const RERANK_INPUTS = [
  Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, text: `candidate ${i}: short text` })),
  Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, text: `candidate ${i}: medium length passage discussing models` })),
  Array.from({ length: 16 }, (_, i) => ({ id: `d${i}`, text: `candidate ${i}: ${('token '.repeat(40))}` })),
  Array.from({ length: 24 }, (_, i) => ({ id: `d${i}`, text: `candidate ${i}: ${('lorem '.repeat(60))}` })),
  Array.from({ length: 32 }, (_, i) => ({ id: `d${i}`, text: `candidate ${i}: ${('passage '.repeat(80))}` })),
];

async function main(): Promise<void> {
  const measurements: ToolMeasurement[] = [];

  // classifyIntent (cheap, no network)
  const intent = await import('../../src/search/v1/intent-router.js');
  measurements.push(
    await measure('classifyIntent', SEARCH_QUERIES, (q) =>
      intent.classifyIntent(q as string),
    ),
  );

  // extractContent (pure CPU)
  const pipeline = await import('../../src/extraction/pipeline.js');
  measurements.push(
    await measure('extractContent', EXTRACT_INPUTS, async (i) => {
      const { html, url } = i as { html: string; url: string };
      return pipeline.extractContent(html, url, { maxChars: 20_000 });
    }),
  );

  // embed (ONNX model inference)
  const embedMod = await import('../../src/providers/embed-provider.js');
  const embed = await embedMod.getEmbedProvider();
  measurements.push(
    await measure('embed.embed', EMBED_INPUTS, (texts) =>
      embed.embed(texts as string[]),
    ),
  );

  // rerank (cross-encoder inference)
  const rerankMod = await import('../../src/providers/rerank-provider.js');
  const rerank = await rerankMod.getRerankProvider();
  measurements.push(
    await measure('rerank.rerank', RERANK_INPUTS, (cands) =>
      rerank.rerank(RERANK_QUERY, cands as { id: string; text: string }[]),
    ),
  );

  // runV1Search (network — dev host only)
  if (process.env.RUN_PERF_BENCH_NETWORK === '1') {
    const orch = await import('../../src/search/v1/orchestrator.js');
    measurements.push(
      await measure('runV1Search', SEARCH_QUERIES, (q) =>
        orch.runV1Search({ query: q as string, maxResults: 5, timeoutMs: 10_000 }),
      ),
    );
  } else {
    process.stderr.write(
      '[bench:perf] Skipping runV1Search (set RUN_PERF_BENCH_NETWORK=1 to include).\n',
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    iterations_per_input: ITERATIONS,
    warm_runs_per_input: WARM_RUNS,
    measurements,
  };
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  process.stdout.write('\n[bench:perf] Results\n');
  for (const m of measurements) {
    process.stdout.write(
      `  ${m.tool.padEnd(20)} inputs=${m.inputs} iters=${m.iterations} p50=${m.p50_ms}ms p95=${m.p95_ms}ms\n`,
    );
  }
  process.stdout.write(`\n[bench:perf] Wrote ${OUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(
    `[bench:perf] FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
